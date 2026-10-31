import mongoose from 'mongoose';
import Booking from '../models/Booking.js';
import Trip from '../models/Trip.js';

// Read-only single-booking inspection. The script deliberately does not load .env files.
const pendingMismatchesMode = process.argv.includes('--pending-mismatches');
const tripFlagIndex = process.argv.indexOf('--trip');
const tripIdentifier = tripFlagIndex >= 0 ? process.argv[tripFlagIndex + 1] : null;
const bookingReference = pendingMismatchesMode || tripFlagIndex >= 0 ? null : process.argv[2];
if ((!bookingReference && !pendingMismatchesMode && tripFlagIndex < 0) || (tripFlagIndex >= 0 && !tripIdentifier)) {
  console.error('Usage: MONGO_URI=<staging-uri> node src/scripts/diagnose-booking-price.js <booking-reference> | --pending-mismatches | --trip <trip-id-or-slug>');
  process.exitCode = 2;
} else if (!process.env.MONGO_URI) {
  console.error('MONGO_URI must be supplied by the operator. No files are read for configuration.');
  process.exitCode = 2;
} else {
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    const projection = '_id bookingReference trip departure numberOfSeats pricePerSeat totalAmount status paymentStatus razorpayOrderId';
    if (tripFlagIndex >= 0) {
      const lookup = mongoose.isValidObjectId(tripIdentifier)
        ? { _id: tripIdentifier }
        : { slug: tripIdentifier.toLowerCase() };
      const trip = await Trip.findOne(lookup).select('_id title slug status basePrice').lean();
      console.log(JSON.stringify({ found: Boolean(trip), trip: trip ? {
        id: String(trip._id), title: trip.title, slug: trip.slug, status: trip.status,
        basePrice: trip.basePrice,
        basePriceValid: typeof trip.basePrice === 'number' && Number.isFinite(trip.basePrice) && trip.basePrice >= 0,
      } : null }, null, 2));
    } else if (pendingMismatchesMode) {
      const bookings = await Booking.find({ status: 'pending', paymentStatus: 'pending' })
        .select(projection)
        .populate({ path: 'trip', select: 'title slug basePrice status' })
        .populate({ path: 'departure', select: 'trip startDate endDate price status availableSeats' })
        .lean();
      const mismatches = bookings.filter((booking) => {
        const basePrice = booking.trip?.basePrice;
        const expectedTotal = Number(basePrice) * Number(booking.numberOfSeats);
        return typeof basePrice !== 'number' || !Number.isFinite(basePrice) || basePrice < 0
          || booking.pricePerSeat !== basePrice
          || booking.totalAmount !== expectedTotal;
      });
      console.log(JSON.stringify({ mode: 'pending-price-mismatches', readOnly: true, count: mismatches.length, bookings: mismatches.map((booking) => ({
        bookingReference: booking.bookingReference,
        bookingId: String(booking._id),
        bookingStatus: booking.status,
        paymentStatus: booking.paymentStatus,
        trip: booking.trip ? { id: String(booking.trip._id), title: booking.trip.title, slug: booking.trip.slug, basePrice: booking.trip.basePrice } : null,
        bookingSnapshot: { pricePerTraveller: booking.pricePerSeat, travellerCount: booking.numberOfSeats, totalAmount: booking.totalAmount, currentTripTotal: Number(booking.trip?.basePrice) * Number(booking.numberOfSeats) },
        razorpayOrderIdPresent: Boolean(booking.razorpayOrderId),
      })) }, null, 2));
    } else {
      const booking = await Booking.findOne({ bookingReference })
        .select(projection)
        .populate({ path: 'trip', select: 'title slug basePrice status' })
        .populate({ path: 'departure', select: 'trip startDate endDate price status availableSeats' })
        .lean();

      if (!booking) {
        console.log(JSON.stringify({ found: false, bookingReference }));
      } else {
        const departureTripId = booking.departure?.trip ? String(booking.departure.trip) : null;
        const bookingTripId = booking.trip?._id ? String(booking.trip._id) : null;
        const expectedTotal = Number(booking.pricePerSeat) * Number(booking.numberOfSeats);
        console.log(JSON.stringify({
          found: true,
          bookingReference: booking.bookingReference,
          bookingId: String(booking._id),
          bookingStatus: booking.status,
          paymentStatus: booking.paymentStatus,
          trip: booking.trip ? { id: bookingTripId, title: booking.trip.title, slug: booking.trip.slug, status: booking.trip.status, basePrice: booking.trip.basePrice } : null,
          departure: booking.departure ? { id: String(booking.departure._id), tripId: departureTripId, startDate: booking.departure.startDate, endDate: booking.departure.endDate, legacyDeparturePrice: booking.departure.price, status: booking.departure.status, availableSeats: booking.departure.availableSeats } : null,
          bookingSnapshot: { pricePerTraveller: booking.pricePerSeat, travellerCount: booking.numberOfSeats, totalAmount: booking.totalAmount, expectedTotal, razorpayAmountPaise: Math.round(Number(booking.totalAmount) * 100) },
          consistency: { bookingTripMatchesDeparture: Boolean(bookingTripId && departureTripId && bookingTripId === departureTripId), storedTotalMatchesSnapshot: Number(booking.totalAmount) === expectedTotal, bookingPriceMatchesCurrentTrip: booking.pricePerSeat === booking.trip?.basePrice, pendingPriceReviewRequired: booking.status === 'pending' && booking.paymentStatus === 'pending' && (booking.pricePerSeat !== booking.trip?.basePrice || Number(booking.totalAmount) !== Number(booking.trip?.basePrice) * Number(booking.numberOfSeats)) },
          razorpayOrderIdPresent: Boolean(booking.razorpayOrderId),
        }, null, 2));
      }
    }
  } catch (error) {
    const code = typeof error?.code === 'string' && /^[A-Za-z0-9_-]{1,30}$/.test(error.code) ? error.code : undefined;
    console.error(JSON.stringify({ diagnosticFailed: true, errorName: error?.name || 'Error', ...(code ? { errorCode: code } : {}) }));
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
