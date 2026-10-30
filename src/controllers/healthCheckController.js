import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import mongoose from "mongoose";
import { areTransactionsAvailable } from "../utils/transaction-support.js";
import NotificationWorkerHeartbeat from "../models/NotificationWorkerHeartbeat.js";
import NotificationOutbox from "../models/NotificationOutbox.js";

const healthCheck = asyncHandler(async (req, res,) => {
    const databaseReady = mongoose.connection.readyState === 1;
    const transactionsAvailable = areTransactionsAvailable() === true;
    const statusCode = databaseReady && transactionsAvailable ? 200 : 503;
    res.status(statusCode).json(new ApiResponse(statusCode, {
        api: statusCode === 200 ? "ready" : "degraded",
        database: databaseReady ? "ready" : "unavailable",
        transactions: transactionsAvailable ? "available" : "unavailable",
    }, statusCode === 200 ? "Safar API is ready" : "Safar API dependencies are not ready"));
});

const workerHealthCheck = asyncHandler(async (req, res) => {
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json(new ApiResponse(503, { worker: "database_unavailable" }, "Notification worker status cannot be checked"));
    }
    const heartbeat = await NotificationWorkerHeartbeat.findById("notification-outbox").lean();
    const deadLetterJobs = await NotificationOutbox.countDocuments({ status: "dead" });
    const maxAgeMs = 45_000;
    const fresh = Boolean(heartbeat?.lastHeartbeatAt && Date.now() - new Date(heartbeat.lastHeartbeatAt).getTime() <= maxAgeMs);
    const liveness = fresh;
    const currentLeaseExpired = Boolean(heartbeat?.currentJobId && heartbeat?.currentLeaseUntil
        && new Date(heartbeat.currentLeaseUntil).getTime() <= Date.now());
    const lastJobProgressAt = heartbeat?.lastLeaseRenewalAt || heartbeat?.currentJobStartedAt;
    const progressAgeMs = heartbeat?.currentJobId && lastJobProgressAt
        ? Date.now() - new Date(lastJobProgressAt).getTime()
        : 0;
    const passAgeMs = heartbeat?.lastPassStartedAt
        ? Date.now() - new Date(heartbeat.lastPassStartedAt).getTime()
        : 0;
    const stalled = (heartbeat?.currentProcessingState === "processing"
            && (currentLeaseExpired || progressAgeMs > 90_000))
        || (heartbeat?.currentProcessingState === "polling" && passAgeMs > 5 * 60_000);
    const available = liveness && !stalled && heartbeat?.state === "healthy"
        && heartbeat?.currentProcessingState !== "degraded";
    const statusCode = available ? 200 : 503;
    res.status(statusCode).json(new ApiResponse(statusCode, {
        worker: {
            availability: available ? "available" : "unavailable",
            liveness: liveness ? "alive" : !fresh ? "stale" : heartbeat?.state || "not_started",
            state: heartbeat?.state || "not_started",
            lastHeartbeatAt: heartbeat?.lastHeartbeatAt || null,
        },
        processing: {
            state: stalled ? "stalled" : heartbeat?.currentProcessingState || "idle",
            currentJobId: heartbeat?.currentJobId || null,
            currentJobStartedAt: heartbeat?.currentJobStartedAt || null,
            currentLeaseUntil: heartbeat?.currentLeaseUntil || null,
            lastLeaseRenewalAt: heartbeat?.lastLeaseRenewalAt || null,
            lastSuccessfulClaimAt: heartbeat?.lastSuccessfulClaimAt || null,
            lastSuccessfulCompletionAt: heartbeat?.lastSuccessfulCompletionAt || null,
            lastPassCompletedAt: heartbeat?.lastPassCompletedAt || null,
        },
        queue: { deadLetterJobs, requiresAttention: deadLetterJobs > 0 },
        ...(heartbeat?.lastErrorCode ? { lastErrorCode: heartbeat.lastErrorCode } : {}),
    }, available ? "Notification worker process is available" : "Notification worker is stale, degraded, or stalled"));
});

export { healthCheck, workerHealthCheck };
