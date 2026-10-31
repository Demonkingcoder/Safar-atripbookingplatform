
import mongoose from "mongoose";

const bookingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    trip: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Trip",
      required: true,
    },

    departure: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Departure",
      required: true,
    },

    numberOfSeats: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: "Number of seats must be an integer",
      },
    },

    // Snapshot the customer's selected UI language for lifecycle notifications.
    notificationLanguage: { type: String, enum: ["en", "hi"], default: "en" },

    pricePerSeat: {
      type: Number,
      required: true,
      min: 0,
    },

    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    idempotencyKey: {
      type: String,
      maxlength: 128,
      default: undefined,
    },

    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },

    razorpayOrderStartedAt: {
      type: Date,
      default: null,
    },

    bookingReference: {
      type: String,
      default: () => `SAF-${new mongoose.Types.ObjectId().toString().toUpperCase()}`,
    },

    cancellationReason: { type: String, maxlength: 500, default: null },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    seatsReleasedAt: { type: Date, default: null },
    refundId: { type: String, default: null },
    refundAmount: { type: Number, min: 0, default: null },
    refundRequestedAt: { type: Date, default: null },
    refundRetryAfter: { type: Date, default: null },
    refundRequestKey: { type: String, default: null, maxlength: 100 },
    refundAttempt: { type: Number, min: 0, default: 0 },
    refundProcessedAt: { type: Date, default: null },
    refundFailureCode: { type: String, default: null },

    status: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "cancelled",
        "failed",
        "expired",
        "refund_pending",
        "refunded",
      ],
      default: "pending",
    },

    paymentStatus: {
      type: String,
      enum: [
        "pending",
        "paid",
        "failed",
        "refund_pending",
        "refund_failed",
        "refunded",
      ],
      default: "pending",
    },

    razorpayOrderId: {
        type: String,
        default: null,
    },

    razorpayPaymentId: {
        type: String,
        default: null,
    },
    paymentFailureCode: { type: String, maxlength: 64, default: null },
  },
  { timestamps: true }
);

bookingSchema.index({ user: 1, createdAt: -1 });
bookingSchema.index({ departure: 1, status: 1 });
bookingSchema.index({ status: 1, updatedAt: -1 });
bookingSchema.index({ bookingReference: 1 }, { unique: true, partialFilterExpression: { bookingReference: { $type: "string" } } });
bookingSchema.index(
  { user: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } }
);

const Booking = mongoose.model("Booking", bookingSchema);

export default Booking;
