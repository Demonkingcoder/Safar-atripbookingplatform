import mongoose from "mongoose";

const notificationOutboxSchema = new mongoose.Schema({
  eventKey: { type: String, required: true, unique: true, maxlength: 255 },
  type: {
    type: String,
    required: true,
    enum: ["booking_confirmed", "booking_cancelled", "booking_expired", "payment_failed", "refund_pending", "refund_processed", "refund_failed", "departure_cancelled", "admin_booking_notification", "upcoming_trip_reminder"],
  },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  recipientEmail: { type: String, trim: true, lowercase: true, default: null, maxlength: 320 },
  booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true, index: true },
  reason: { type: String, maxlength: 500, default: "" },
  status: { type: String, required: true, enum: ["pending", "processing", "sent", "dead"], default: "pending" },
  attempts: { type: Number, min: 0, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now, index: true },
  lockedUntil: { type: Date, default: null },
  lockToken: { type: String, default: null },
  lastErrorCode: { type: String, maxlength: 64, default: null },
  sentAt: { type: Date, default: null },
}, { timestamps: true });

notificationOutboxSchema.index({ status: 1, nextAttemptAt: 1, createdAt: 1 });
notificationOutboxSchema.index({ status: 1, lockedUntil: 1 });

const NotificationOutbox = mongoose.models.NotificationOutbox || mongoose.model("NotificationOutbox", notificationOutboxSchema);
export default NotificationOutbox;
