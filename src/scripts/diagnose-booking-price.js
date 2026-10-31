import mongoose from 'mongoose';
import Booking from '../models/Booking.js';

// Read-only single-booking inspection. The script deliberately does not load .env files.
const bookingReference = process.argv[2];
if (!bookingReference) {
  console.error('Usage: MONGO_URI=<staging-uri> node src/scripts/diagnose-booking-price.js <booking-reference>');
  process.exitCode = 2;
} else if (!process.env.MONGO_URI) {
  console.error('MONGO_URI must be supplied by the operator. No files are read for configuration.');
  process.exitCode = 2;
} else {
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    const booking = await Booking.findOne({ bookingReference })
      .select('_id bookingReference trip departure numberOfSeats pricePerSeat totalAmount status paymentStatus razorpayOrderId')
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
        departure: booking.departure ? { id: String(booking.departure._id), tripId: departureTripId, startDate: booking.departure.startDate, endDate: booking.departure.endDate, fullPricePerTraveller: booking.departure.price, status: booking.departure.status, availableSeats: booking.departure.availableSeats } : null,
        bookingSnapshot: { pricePerTraveller: booking.pricePerSeat, travellerCount: booking.numberOfSeats, totalAmount: booking.totalAmount, expectedTotal, razorpayAmountPaise: Math.round(Number(booking.totalAmount) * 100) },
        consistency: { bookingTripMatchesDeparture: Boolean(bookingTripId && departureTripId && bookingTripId === departureTripId), storedTotalMatchesSnapshot: Number(booking.totalAmount) === expectedTotal },
        razorpayOrderIdPresent: Boolean(booking.razorpayOrderId),
      }, null, 2));
    }
  } catch (error) {
    const code = typeof error?.code === 'string' && /^[A-Za-z0-9_-]{1,30}$/.test(error.code) ? error.code : undefined;
    console.error(JSON.stringify({ diagnosticFailed: true, errorName: error?.name || 'Error', ...(code ? { errorCode: code } : {}) }));
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
