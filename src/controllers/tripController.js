
import Trip from "../models/Trip.js";
import { ApiResponse } from "../utils/api-response.js";
import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const withStartingPrices = async (trips) => {
  return trips.map((trip) => ({
    ...trip,
    startingPrice: trip.basePrice,
    startingPriceSource: "basePrice",
    startingDepartureDate: null,
  }));
};

// GET /api/v1/trips
const getAllTrips = asyncHandler(async (req, res) => {
  const trips = await Trip.find({ status: "published" })
    .select("-__v")
    .sort({ createdAt: -1 }) // sorting in descending for ascending use 1
    .lean(); //This tells Mongoose to return ordinary JavaScript objects instead.
  const pricedTrips = await withStartingPrices(trips);

  return res.status(200).json(
    new ApiResponse(
      200,
      { trips: pricedTrips },
      "Trips fetched successfully"
    )
  );
});

// GET /api/v1/trips/:slug
const getTripBySlug = asyncHandler(async (req, res) => {
  const { slug } = req.params;

  const trip = await Trip.findOne({
    slug: slug.toLowerCase(),
    status: "published",
  })
    .select("-__v")
    .lean();

  if (!trip) {
    throw new ApiError(404, "Trip not found");
  }

  const [pricedTrip] = await withStartingPrices([trip]);

  return res.status(200).json(
    new ApiResponse(
      200,
      { trip: pricedTrip },
      "Trip fetched successfully"
    )
  );
});

export { getAllTrips, getTripBySlug };
