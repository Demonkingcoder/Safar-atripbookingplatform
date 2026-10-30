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
    const healthy = fresh && heartbeat.state === "healthy" && deadLetterJobs === 0;
    const statusCode = healthy ? 200 : 503;
    res.status(statusCode).json(new ApiResponse(statusCode, {
        worker: !fresh ? "stale_or_not_started" : heartbeat?.state || "not_started",
        lastHeartbeatAt: heartbeat?.lastHeartbeatAt || null,
        deadLetterJobs,
        ...(heartbeat?.lastErrorCode ? { lastErrorCode: heartbeat.lastErrorCode } : {}),
    }, healthy ? "Notification worker is healthy" : "Notification worker is stale, degraded, or has dead-letter jobs"));
});

export { healthCheck, workerHealthCheck };
