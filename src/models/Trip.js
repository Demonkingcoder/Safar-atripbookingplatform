
import mongoose from "mongoose";

const tripSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Trip title is required"],
      trim: true,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    description: {
      type: String,
      required: [true, "Trip description is required"],
      trim: true,
    },

    destination: {
      type: String,
      required: [true, "Destination is required"],
      trim: true,
    },

    durationDays: {
      type: Number,
      required: true,
      min: 1,
    },

    durationNights: {
      type: Number,
      required: true,
      min: 0,
    },

    itinerary: [
      {
        day: {
          type: Number,
          required: true,
          min: 1,
        },
        title: {
          type: String,
          required: true,
          trim: true,
        },
        description: {
          type: String,
          required: true,
          trim: true,
        },
      },
    ],

    inclusions: [{ type: String, trim: true }],
    exclusions: [{ type: String, trim: true }],
    images: [{ type: String, trim: true }],

    basePrice: {
      type: Number,
      required: true,
      min: 0,
    },

    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
    },
  },
  { timestamps: true }
);

const Trip = mongoose.model("Trip", tripSchema);

export default Trip;
