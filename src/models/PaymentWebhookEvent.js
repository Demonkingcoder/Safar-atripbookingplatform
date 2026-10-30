import mongoose from "mongoose";

const paymentWebhookEventSchema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true, maxlength: 255 },
  event: { type: String, required: true, maxlength: 100 },
  payloadHash: { type: String, required: true, maxlength: 64 },
  status: { type: String, enum: ["processing", "processed", "failed"], default: "processing", required: true },
  leaseExpiresAt: { type: Date, default: null, index: true },
  processedAt: { type: Date, default: null },
  attempts: { type: Number, default: 1, min: 1 },
  lastErrorCode: { type: String, default: null, maxlength: 64 },
}, { timestamps: true });

paymentWebhookEventSchema.index({ status: 1, leaseExpiresAt: 1 });

const PaymentWebhookEvent = mongoose.models.PaymentWebhookEvent || mongoose.model("PaymentWebhookEvent", paymentWebhookEventSchema);
export default PaymentWebhookEvent;