
import Trip from "../models/Trip.js";
import Departure from "../models/Departure.js";
import { ApiResponse } from "../utils/api-response.js";
import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const withStartingPrices = async (trips) => {
  if (!trips.length) return trips;
  const now = new Date();
  const departures = await Departure.find({
    trip: { $in: trips.map((trip) => trip._id) },
    status: "scheduled",
    startDate: { $gt: now },
    availableSeats: { $gt: 0 },
  }).select("trip price").sort({ price: 1 }).lean();
  const prices = new Map();
  for (const departure of departures) {
    const key = String(departure.trip);
    if (!prices.has(key)) prices.set(key, { price: departure.price, date: departure.startDate });
  }
  return trips.map((trip) => {
    const departure = prices.get(String(trip._id));
    return {
      ...trip,
      startingPrice: departure?.price ?? trip.basePrice,
      startingPriceSource: departure === undefined ? "basePrice" : "departure",
      startingDepartureDate: departure?.date ?? null,
    };
  });
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
