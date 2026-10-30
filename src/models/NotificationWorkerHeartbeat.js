import mongoose from "mongoose";

const notificationWorkerHeartbeatSchema = new mongoose.Schema({
  _id: { type: String, default: "notification-outbox" },
  state: { type: String, enum: ["starting", "healthy", "degraded"], required: true, default: "starting" },
  lastHeartbeatAt: { type: Date, required: true },
  lastErrorCode: { type: String, maxlength: 64, default: null },
}, { timestamps: true, _id: false });

const NotificationWorkerHeartbeat = mongoose.models.NotificationWorkerHeartbeat
  || mongoose.model("NotificationWorkerHeartbeat", notificationWorkerHeartbeatSchema);

export default NotificationWorkerHeartbeat;
