import mongoose from "mongoose";

const notificationWorkerHeartbeatSchema = new mongoose.Schema({
  _id: { type: String, default: "notification-outbox" },
  state: { type: String, enum: ["starting", "healthy", "degraded"], required: true, default: "starting" },
  lastHeartbeatAt: { type: Date, required: true },
  lastPassStartedAt: { type: Date, default: null },
  lastPassCompletedAt: { type: Date, default: null },
  lastSuccessfulClaimAt: { type: Date, default: null },
  lastSuccessfulCompletionAt: { type: Date, default: null },
  lastAttemptCompletedAt: { type: Date, default: null },
  currentJobId: { type: String, default: null },
  currentJobStartedAt: { type: Date, default: null },
  currentLeaseUntil: { type: Date, default: null },
  lastLeaseRenewalAt: { type: Date, default: null },
  currentProcessingState: { type: String, enum: ["idle", "polling", "processing", "degraded", "lease_lost"], default: "idle" },
  lastJobOutcome: { type: String, enum: ["sent", "retry", "dead"], default: null },
  lastErrorCode: { type: String, maxlength: 64, default: null },
}, { timestamps: true, _id: false });

const NotificationWorkerHeartbeat = mongoose.models.NotificationWorkerHeartbeat
  || mongoose.model("NotificationWorkerHeartbeat", notificationWorkerHeartbeatSchema);

export default NotificationWorkerHeartbeat;
