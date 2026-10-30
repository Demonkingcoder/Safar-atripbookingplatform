import Booking from "../models/Booking.js";
import { processExpiredPendingBooking } from "../controllers/bookingController.js";

export async function expirePendingBookings(now = new Date()) {
  const candidates = await Booking.find({
    status: "pending",
    paymentStatus: "pending",
    expiresAt: { $lte: now },
  }).select("_id").lean();

  let processedCount = 0;
  for (const candidate of candidates) {
    // Provider status is checked before releasing inventory. Unreachable or
    // authorized payments remain reserved and are retried on the next pass.
    if (await processExpiredPendingBooking(candidate._id, now)) processedCount += 1;
  }
  return processedCount;
}
