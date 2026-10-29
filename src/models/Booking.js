
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

    status: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "cancelled",
        "failed",
      ],
      default: "pending",
    },

    paymentStatus: {
      type: String,
      enum: [
        "pending",
        "paid",
        "failed",
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
  },
  { timestamps: true }
);

bookingSchema.index({ user: 1, createdAt: -1 });
bookingSchema.index({ departure: 1, status: 1 });

const Booking = mongoose.model("Booking", bookingSchema);

export default Booking;