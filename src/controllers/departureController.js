
import Trip from "../models/Trip.js";
import Departure from "../models/Departure.js";
import { ApiResponse } from "../utils/api-response.js";
import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// GET /api/v1/trips/:slug/departures
const getTripDepartures = asyncHandler(async (req, res) => {
  const { slug } = req.params;

  const trip = await Trip.findOne({
    slug: slug.toLowerCase(),
    status: "published",
  }).select("_id");

  if (!trip) {
    throw new ApiError(404, "Trip not found");
  }

  const departures = await Departure.find({
    trip: trip._id,
    status: "scheduled",
    startDate: { $gte: new Date() },
  })
    .select("-__v")
    .sort({ startDate: 1 })
    .lean();

  return res.status(200).json(
    new ApiResponse(
      200,
      { departures },
      "Departures fetched successfully"
    )
  );
});

export { getTripDepartures };