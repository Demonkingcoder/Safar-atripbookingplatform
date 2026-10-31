import mongoose from "mongoose";

const departureSchema = new mongoose.Schema(
  {
    trip: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Trip",
      required: [true, "Trip reference is required"],
      index: true,
    },

    startDate: {
      type: Date,
      required: [true, "Start date is required"],
    },

    endDate: {
      type: Date,
      required: [true, "End date is required"],
      validate: {
        validator: function (value) {
          return !this.startDate || value > this.startDate;
        },
        message: "End date must be after start date",
      },
    },

    // Legacy/admin field only. Customer payable pricing is authoritative on Trip.basePrice.
    price: {
      type: Number,
      required: [true, "Departure price is required"],
      min: [0, "Price cannot be negative"],
    },

    totalSeats: {
      type: Number,
      required: [true, "Total seats are required"],
      min: [1, "A departure must have at least one seat"],
      validate: {
        validator: Number.isInteger,
        message: "Total seats must be an integer",
      },
    },

    availableSeats: {
      type: Number,
      required: true,
      min: [0, "Available seats cannot be negative"],
      validate: {
        validator: Number.isInteger,
        message: "Available seats must be an integer",
      },
    },

    status: {
      type: String,
      enum: ["scheduled", "cancelled", "completed"],
      default: "scheduled",
    },
    cancellationReason: { type: String, maxlength: 500, default: null },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

departureSchema.index({ trip: 1, startDate: 1 });
departureSchema.index({ status: 1, startDate: 1 });

const Departure = mongoose.model("Departure", departureSchema);

export default Departure;
