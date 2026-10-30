import mongoose from "mongoose";
import Booking from "../models/Booking.js";
import Departure from "../models/Departure.js";
import { requireTransactionSupport, transactionUnavailableError } from "./transaction-support.js";
import { createBookingNotificationOutboxRecord } from "./notification-outbox.js";

/** Transition a booking and release its reserved seats as one database operation. */
export async function transitionAndReleaseSeats({ bookingId, fromStatuses, set, now = new Date(), notification = null }) {
  requireTransactionSupport();
  const session = await mongoose.startSession();
  let transitioned = null;
  try {
    await session.withTransaction(async () => {
      transitioned = null;
      const booking = await Booking.findOneAndUpdate(
        { _id: bookingId, status: { $in: fromStatuses }, seatsReleasedAt: null },
        { $set: set },
        { new: true, session }
      );
      if (!booking) return;

      const release = await Departure.updateOne(
        { _id: booking.departure },
        { $inc: { availableSeats: booking.numberOfSeats } },
        { session }
      );
      if (release.matchedCount !== 1) throw new Error("Departure inventory could not be updated");

      transitioned = await Booking.findOneAndUpdate(
        { _id: booking._id, status: set.status, seatsReleasedAt: null },
        { $set: { seatsReleasedAt: now } },
        { new: true, session }
      );
      if (!transitioned) throw new Error("Booking inventory release could not be recorded");
      if (notification) {
        await createBookingNotificationOutboxRecord(
          transitioned,
          notification.type,
          notification.reason || transitioned.cancellationReason || "",
          session
        );
      }
    });
    return transitioned;
  } catch (error) {
    throw transactionUnavailableError(error);
  } finally {
    await session.endSession();
  }
}
