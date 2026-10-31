
import mongoose from "mongoose";
import Booking from "../models/Booking.js";
import Trip from "../models/Trip.js";
import Departure from "../models/Departure.js";
import { ApiResponse } from "../utils/api-response.js";
import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import razorpay, { getRazorpayConfiguration, isRazorpayApiConfigured } from "../utils/razorpay.js";
import crypto from "node:crypto";
import { transitionAndReleaseSeats } from "../utils/booking-inventory.js";
import { requireTransactionSupport, transactionUnavailableError } from "../utils/transaction-support.js";
import PaymentWebhookEvent from "../models/PaymentWebhookEvent.js";
import { enqueueBookingNotification, transitionBookingAndQueueNotification } from "../utils/notification-outbox.js";

const bookingPaymentFailureMessage = "Your payment could not be completed. Your booking has not been confirmed and no tickets have been issued. Please try again.";

async function getOrderPayments(orderId) {
  if (!isRazorpayApiConfigured()) {
    throw new ApiError(503, "Online payment is not configured");
  }
  let result;
  try {
    result = await razorpay.orders.fetchPayments(orderId);
  } catch {
    throw new ApiError(503, "The payment provider could not confirm the payment status. Please retry shortly.");
  }
  return Array.isArray(result?.items) ? result.items : [];
}

function hasUnresolvedPayment(payments) {
  return payments.some((payment) => ["created", "authorized", "pending"].includes(payment.status));
}

function findCapturedPayment(payments) {
  return payments.find((payment) => payment.status === "captured");
}

async function notifyCustomer(booking, { confirmed = false, refundPending = false, refundProcessed = false, refundFailed = false, reason = "" } = {}) {
  const type = confirmed
    ? "booking_confirmed"
    : refundProcessed
      ? "refund_processed"
      : refundFailed
        ? "refund_failed"
        : refundPending
          ? "refund_pending"
          : booking.status === "expired"
            ? "booking_expired"
            : booking.status === "failed" || booking.paymentStatus === "failed"
              ? "payment_failed"
              : "booking_cancelled";
  await enqueueBookingNotification(booking, type, reason || booking.cancellationReason || "");
}

async function notifyDepartureCancellation(booking, reason) {
  await enqueueBookingNotification(booking, "departure_cancelled", reason);
}
async function requestRefund(booking, payment, reason) {
  const amount = Math.round(booking.totalAmount * 100);
  if (!Number.isSafeInteger(amount) || amount < 100 || payment.amount !== amount || payment.currency !== "INR") {
    throw new ApiError(409, "The captured payment does not match this booking; refund needs reconciliation");
  }
  const now = new Date();
  const requestKey = `safar-refund-${crypto.createHash("sha256").update(`${booking._id}:${booking.refundAttempt || 0}`).digest("hex").slice(0, 32)}`;
  let current = booking;
  let claim = await Booking.findOneAndUpdate(
    { _id: booking._id, razorpayPaymentId: payment.id, paymentStatus: "refund_pending", refundId: null, refundRequestedAt: null },
    { $set: { refundRequestedAt: now, refundRetryAfter: new Date(now.getTime() + 10 * 60 * 1000), refundRequestKey: requestKey, refundAmount: booking.totalAmount } },
    { new: true }
  );

  if (!claim) {
    current = await Booking.findById(booking._id);
    if (!current || current.razorpayPaymentId !== payment.id || current.paymentStatus !== "refund_pending") return current;
    if (current.refundId) {
      let storedRefund;
      try {
        storedRefund = await razorpay.payments.fetchRefund(payment.id, current.refundId);
      } catch {
        throw new ApiError(503, "The payment provider could not confirm the existing refund. No duplicate refund was requested.");
      }
      if (!storedRefund || storedRefund.payment_id !== payment.id || storedRefund.amount !== amount) {
        throw new ApiError(409, "The provider refund needs reconciliation before retrying");
      }
      if (storedRefund.status === "processed") {
        const processed = await reconcileRefundWebhook({ id: storedRefund.id, payment_id: payment.id, amount }, "refund.processed");
        if (processed) await notifyCustomer(processed, { refundProcessed: true, reason });
        return processed;
      }
      if (storedRefund.status === "failed") {
        const failed = await transitionBookingAndQueueNotification({
          filter: { _id: booking._id, refundId: storedRefund.id, paymentStatus: "refund_pending" },
          update: { $set: { paymentStatus: "refund_failed", refundFailureCode: "provider_refund_failed" } },
          type: "refund_failed",
          reason,
        });
        return failed || current;
      }
      return current;
    }

    // Resolve an earlier timed-out request with the provider before deciding whether to retry.
    let providerRefunds;
    try {
      providerRefunds = await razorpay.payments.fetchMultipleRefund(payment.id, { count: 100 });
    } catch {
      throw new ApiError(503, "The payment provider could not confirm the refund status. No new refund was requested.");
    }
    const priorRefund = (providerRefunds?.items || []).find((refund) => refund?.notes?.safar_refund_request === requestKey);
    if (priorRefund) {
      if (priorRefund.payment_id !== payment.id || priorRefund.amount !== amount) {
        throw new ApiError(409, "The provider refund does not match this booking and requires reconciliation");
      }
      const status = priorRefund.status === "processed" ? "refunded" : priorRefund.status === "failed" ? "refund_failed" : "refund_pending";
      if (status === "refunded") {
        const processed = await reconcileRefundWebhook({ id: priorRefund.id, payment_id: payment.id, amount }, "refund.processed");
        if (processed) await notifyCustomer(processed, { refundProcessed: true, reason });
        return processed || await Booking.findById(booking._id);
      }
      const reconciled = await transitionBookingAndQueueNotification({
        filter: { _id: booking._id, paymentStatus: "refund_pending", razorpayPaymentId: payment.id },
        update: { $set: { refundId: priorRefund.id, refundAmount: booking.totalAmount, paymentStatus: status, refundRetryAfter: null, ...(status === "refund_failed" ? { refundFailureCode: "provider_refund_failed" } : {}) } },
        type: status === "refund_failed" ? "refund_failed" : "refund_pending",
        reason,
      });
      return reconciled || current;
    }
    if (current.refundRetryAfter && current.refundRetryAfter > now) {
      throw new ApiError(409, "The refund request is awaiting provider confirmation. It will be reconciled before another request is sent.");
    }
    claim = await Booking.findOneAndUpdate(
      { _id: booking._id, razorpayPaymentId: payment.id, paymentStatus: "refund_pending", refundId: null, refundRequestedAt: current.refundRequestedAt, refundRetryAfter: { $lte: now } },
      { $set: { refundRequestedAt: now, refundRetryAfter: new Date(now.getTime() + 10 * 60 * 1000), refundRequestKey: requestKey, refundAmount: booking.totalAmount } },
      { new: true }
    );
    if (!claim) throw new ApiError(409, "The refund is already being reconciled. Please retry after provider status is checked.");
  }

  try {
    const refund = await razorpay.payments.refund(payment.id, {
      amount,
      receipt: requestKey,
      notes: { safar_refund_request: requestKey, booking_reference: booking.bookingReference || String(booking._id), reason: String(reason || "Booking cancellation").slice(0, 200) },
    });
    if (!refund?.id || refund.payment_id !== payment.id || refund.amount !== amount || !["pending", "processed", "failed"].includes(refund.status)) {
      throw new Error("Refund provider response could not be reconciled");
    }
    const refundStatus = refund.status === "failed" ? "refund_failed" : "refund_pending";
    const saved = await transitionBookingAndQueueNotification({
      filter: { _id: booking._id, razorpayPaymentId: payment.id, refundRequestedAt: now, paymentStatus: "refund_pending" },
      update: { $set: {
        refundId: refund.id,
        refundAmount: booking.totalAmount,
        refundRetryAfter: null,
        paymentStatus: refundStatus,
        ...(refund.status === "failed" ? { refundFailureCode: "provider_refund_failed" } : {}),
      } },
      type: refund.status === "failed" ? "refund_failed" : "refund_pending",
      reason,
    });
    if (refund.status === "processed") {
      const processed = await reconcileRefundWebhook({ id: refund.id, payment_id: payment.id, amount }, "refund.processed");
      if (processed) await notifyCustomer(processed, { refundProcessed: true, reason });
      return processed;
    }
    return saved || await Booking.findById(booking._id);
  } catch (error) {
    // Keep the refund pending: a timed-out provider request can still have succeeded.
    console.error("Safar refund request needs provider reconciliation");
    throw new ApiError(503, "The payment provider could not confirm the refund request. The refund remains pending reconciliation.");
  }
}

async function confirmCapturedPayment(booking, payment) {
  const amount = Math.round(booking.totalAmount * 100);
  if (!payment.id || payment.order_id !== booking.razorpayOrderId || payment.amount !== amount || payment.currency !== "INR") {
    throw new ApiError(400, "Payment details do not match the booking amount, currency, or order");
  }
  if (booking.paymentStatus === "paid" && booking.razorpayPaymentId === payment.id) return booking;
  if (booking.razorpayPaymentId === payment.id && booking.paymentStatus === "refunded") return booking;
  if (booking.razorpayPaymentId === payment.id && booking.paymentStatus === "refund_failed") return booking;
  if (booking.razorpayPaymentId === payment.id && booking.paymentStatus === "refund_pending") {
    await requestRefund(booking, payment, booking.cancellationReason || "Late captured payment");
    return Booking.findById(booking._id);
  }

  const now = new Date();
  if (booking.status === "pending" && (!booking.expiresAt || booking.expiresAt > now)) {
    const confirmed = await transitionBookingAndQueueNotification({
      filter: { _id: booking._id, status: "pending", paymentStatus: "pending", razorpayOrderId: payment.order_id, $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
      update: { $set: { razorpayPaymentId: payment.id, paymentStatus: "paid", status: "confirmed" } },
      type: "booking_confirmed",
      administratorNotice: true,
    });
    if (confirmed) {
      return confirmed;
    }
    const current = await Booking.findById(booking._id);
    if (current?.paymentStatus === "paid" && current.razorpayPaymentId === payment.id) return current;
    if (!current || !["cancelled", "expired", "refund_pending", "refunded"].includes(current.status)) {
      throw new ApiError(409, "The booking changed while payment was being confirmed");
    }
    booking = current;
  }

  // Never revive an expired/cancelled reservation after its seats may have been released.
  // Record the captured debit and initiate a provider refund instead.
  let refundable = booking;
  if (booking.status === "pending") {
    refundable = await transitionAndReleaseSeats({
      bookingId: booking._id,
      fromStatuses: ["pending"],
      set: { status: "expired", paymentStatus: "refund_pending", razorpayPaymentId: payment.id },
      now,
      notification: { type: "refund_pending", reason: "Payment captured after reservation expiry" },
    });
  } else {
    refundable = await transitionBookingAndQueueNotification({
      filter: { _id: booking._id, status: { $in: ["cancelled", "expired", "failed", "refund_pending"] }, paymentStatus: { $ne: "refunded" } },
      update: { $set: { status: "refund_pending", paymentStatus: "refund_pending", razorpayPaymentId: payment.id } },
      type: "refund_pending",
      reason: "Payment captured after the reservation had closed",
    });
  }
  if (!refundable) throw new ApiError(409, "The payment was captured after the booking closed and requires reconciliation");
  const refundResult = await requestRefund(refundable, payment, "Payment captured after reservation cancellation or expiry");
  return refundResult || refundable;
}

async function resolveProviderPayment(booking) {
  if (!booking.razorpayOrderId) return { state: "unpaid", payment: null };
  const payments = await getOrderPayments(booking.razorpayOrderId);
  const captured = findCapturedPayment(payments);
  if (captured) return { state: "captured", payment: captured };
  if (hasUnresolvedPayment(payments)) return { state: "pending", payment: null };
  if (payments.length && payments.every((payment) => payment.status === "failed" || payment.status === "refunded")) return { state: "failed", payment: null };
  return { state: "unpaid", payment: null };
}

function safePaymentFailureCode(payment) {
  const code = payment?.error_code;
  return typeof code === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(code) ? code : "provider_payment_failed";
}

async function markPendingPaymentFailed(booking, payment = null) {
  const failed = await transitionAndReleaseSeats({
    bookingId: booking._id,
    fromStatuses: ["pending"],
    set: { status: "failed", paymentStatus: "failed", paymentFailureCode: safePaymentFailureCode(payment) },
    notification: { type: "payment_failed" },
    expected: { paymentStatus: "pending", ...(booking.razorpayOrderId ? { razorpayOrderId: booking.razorpayOrderId } : {}) },
  });
  return failed;
}

async function handleCapturedPaymentForOrder(booking, payment) {
  if (!payment || payment.status !== "captured") throw new ApiError(409, "Payment is not confirmed as captured by the payment provider");
  return confirmCapturedPayment(booking, payment);
}

async function reconcileRefundWebhook(refund, event) {
  const booking = await Booking.findOne({ $or: [{ refundId: refund.id }, { razorpayPaymentId: refund.payment_id }] });
  if (!booking) throw new ApiError(404, "Booking for refund was not found");
  if (refund.amount !== Math.round((booking.refundAmount ?? booking.totalAmount) * 100)) {
    throw new ApiError(400, "Refund amount does not match the recorded booking refund");
  }
  if (event === "refund.processed") {
    const releasedBooking = await transitionAndReleaseSeats({
      bookingId: booking._id,
      fromStatuses: ["refund_pending"],
      set: { status: "refunded", paymentStatus: "refunded", refundId: refund.id, refundProcessedAt: new Date(), refundFailureCode: null },
      notification: { type: "refund_processed" },
    });
    if (releasedBooking) return releasedBooking;
    return transitionBookingAndQueueNotification({
      filter: { _id: booking._id, razorpayPaymentId: refund.payment_id, seatsReleasedAt: { $ne: null }, paymentStatus: { $in: ["refund_pending", "refund_failed"] } },
      update: { $set: { status: "refunded", paymentStatus: "refunded", refundId: refund.id, refundProcessedAt: new Date(), refundFailureCode: null } },
      type: "refund_processed",
    });
  }
  return transitionBookingAndQueueNotification({
    filter: { _id: booking._id, paymentStatus: "refund_pending", razorpayPaymentId: refund.payment_id, $or: [{ refundId: refund.id }, { refundId: null }] },
    update: { $set: { status: "refund_pending", paymentStatus: "refund_failed", refundId: refund.id, refundFailureCode: "provider_refund_failed" } },
    type: "refund_failed",
  });
}

// POST /api/v1/bookings
const createBooking = asyncHandler(async (req, res) => {
  const { departureId, numberOfSeats } = req.body || {};
  const idempotencyKey = req.get("Idempotency-Key");

  if (!mongoose.isValidObjectId(departureId)) {
    throw new ApiError(400, "Invalid departure ID");
  }
  if (!Number.isInteger(numberOfSeats) || numberOfSeats < 1 || numberOfSeats > 10) {
    throw new ApiError(400, "Number of seats must be an integer between 1 and 10");
  }
  if (idempotencyKey && (idempotencyKey.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey))) {
    throw new ApiError(400, "Invalid idempotency key");
  }

  if (!idempotencyKey) throw new ApiError(400, "Idempotency-Key header is required");

  const userId = req.user._id;
  if (idempotencyKey) {
    const existing = await Booking.findOne({ user: userId, idempotencyKey });
    if (existing) {
      if (String(existing.departure) !== String(departureId) || existing.numberOfSeats !== numberOfSeats) {
        throw new ApiError(409, "This idempotency key was already used for a different booking request");
      }
      if (["cancelled", "expired", "failed"].includes(existing.status)) {
        throw new ApiError(409, "This booking attempt is no longer active. Start a new booking attempt.");
      }
      return res.status(200).json(new ApiResponse(200, { booking: existing }, "Existing booking returned"));
    }
  }

  const departure = await Departure.findOne({
    _id: departureId,
    status: "scheduled",
    startDate: { $gt: new Date() },
  });
  if (!departure) throw new ApiError(404, "Departure not found or unavailable");

  const trip = await Trip.findOne({ _id: departure.trip, status: "published" });
  if (!trip) throw new ApiError(404, "Trip not found or unavailable");
  const pricePerSeat = trip.basePrice;
  if (typeof pricePerSeat !== "number" || !Number.isFinite(pricePerSeat) || pricePerSeat < 0) {
    throw new ApiError(409, "This trip does not have a valid payable price");
  }
  const totalAmount = pricePerSeat * numberOfSeats;
  if (!Number.isFinite(totalAmount)) throw new ApiError(409, "This trip does not have a valid payable price");

  requireTransactionSupport();
  let booking;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Reserve inventory and create the booking together so a crash cannot strand seats.
      const reservedDeparture = await Departure.findOneAndUpdate(
        {
          _id: departure._id,
          status: "scheduled",
          startDate: { $gt: new Date() },
          availableSeats: { $gte: numberOfSeats },
        },
        { $inc: { availableSeats: -numberOfSeats } },
        { new: true, session }
      );
      if (!reservedDeparture) throw new ApiError(409, "Not enough seats available");

      const created = await Booking.create([{
        user: userId,
        trip: trip._id,
        departure: reservedDeparture._id,
        numberOfSeats,
        notificationLanguage: req.body?.notificationLanguage === "hi" ? "hi" : "en",
        pricePerSeat,
        totalAmount,
        status: "pending",
        paymentStatus: "pending",
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        ...(idempotencyKey ? { idempotencyKey } : {}),
      }], { session });
      booking = created[0];
    });
  } catch (error) {
    if (error?.code === 11000 && idempotencyKey) {
      const existing = await Booking.findOne({ user: userId, idempotencyKey });
      if (existing && String(existing.departure) === String(departureId) && existing.numberOfSeats === numberOfSeats) {
        return res.status(200).json(new ApiResponse(200, { booking: existing }, "Existing booking returned"));
      }
      throw new ApiError(409, "This idempotency key was already used for a different booking request");
    }
    throw transactionUnavailableError(error);
  } finally {
    await session.endSession();
  }
  return res.status(201).json(new ApiResponse(201, { booking }, "Booking created successfully. Payment is pending."));
});

// GET /api/v1/bookings/my-bookings
const getMyBookings = asyncHandler(async (req, res) => {
  const bookings = await Booking.find({ user: req.user._id })
    .populate("trip", "title slug destination images")
    .populate(
      "departure",
      "startDate endDate price status"
    )
    .sort({ createdAt: -1 })
    .lean();

  return res.status(200).json(
    new ApiResponse(
      200,
      { bookings },
      "Bookings fetched successfully"
    )
  );
});


const cancelBooking = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;

  if (!mongoose.isValidObjectId(bookingId)) {
    throw new ApiError(400, "Invalid booking ID");
  }

  const existing = await Booking.findOne({ _id: bookingId, user: req.user._id });
  if (!existing) throw new ApiError(404, "Booking not found");
  if (existing.status !== "pending" || existing.paymentStatus !== "pending") {
    throw new ApiError(409, "Only an unpaid pending reservation can be cancelled by the customer under the current Safar policy");
  }
  const providerPayment = await resolveProviderPayment(existing);
  if (providerPayment.state === "captured") {
    await confirmCapturedPayment(existing, providerPayment.payment);
    throw new ApiError(409, "Payment was captured. Check your booking status before requesting cancellation.");
  }
  if (providerPayment.state === "pending") {
    throw new ApiError(409, "Payment is still being confirmed. Seats remain reserved until the provider reports a final status.");
  }
  const booking = await transitionAndReleaseSeats({
    bookingId,
    fromStatuses: ["pending"],
    set: { status: "cancelled", paymentStatus: "failed", cancelledAt: new Date(), cancelledBy: req.user._id, cancellationReason: "Customer cancellation" },
    notification: { type: "booking_cancelled" },
  });
  if (!booking) throw new ApiError(409, "This booking has already changed and cannot be cancelled");
  return res.status(200).json(
    new ApiResponse(200, { booking }, "Your cancellation request has been received.")
  );
});

async function adminCancelBookingRecord(booking, adminId, reason, notificationType = "booking_cancelled") {
  if (booking.status === "confirmed" && booking.paymentStatus === "paid" && booking.razorpayPaymentId) {
    if (!isRazorpayApiConfigured()) throw new ApiError(503, "Refund processing is not configured");
    let payment;
    try {
      payment = await razorpay.payments.fetch(booking.razorpayPaymentId);
    } catch {
      throw new ApiError(503, "The payment provider could not confirm the captured payment. Cancellation was not finalized.");
    }
    const expectedAmount = Math.round(booking.totalAmount * 100);
    if (payment.status !== "captured" || payment.amount !== expectedAmount || payment.currency !== "INR") {
      throw new ApiError(409, "The payment provider has not confirmed a refundable captured payment");
    }
    const pendingRefund = await transitionBookingAndQueueNotification({
      filter: { _id: booking._id, status: "confirmed", paymentStatus: "paid", razorpayPaymentId: payment.id },
      update: { $set: { status: "refund_pending", paymentStatus: "refund_pending", cancellationReason: reason, cancelledAt: new Date(), cancelledBy: adminId, refundFailureCode: null } },
      type: notificationType === "booking_cancelled" ? "refund_pending" : ["refund_pending", notificationType],
      reason,
    });
    if (!pendingRefund) throw new ApiError(409, "The booking has already changed and cannot be cancelled");
    const updated = await requestRefund(pendingRefund, payment, reason);
    return updated || pendingRefund;
  }

  if (booking.status !== "pending" || booking.paymentStatus !== "pending") {
    throw new ApiError(409, "This booking is not eligible for admin cancellation in its current state");
  }
  const providerPayment = await resolveProviderPayment(booking);
  if (providerPayment.state === "captured") {
    const updated = await confirmCapturedPayment(booking, providerPayment.payment);
    throw new ApiError(409, `Payment was captured; the booking is ${updated?.status || "being reconciled"}`);
  }
  if (providerPayment.state === "pending") throw new ApiError(409, "Payment is still being confirmed; retry the cancellation after provider reconciliation");
  const cancelled = await transitionAndReleaseSeats({
    bookingId: booking._id,
    fromStatuses: ["pending"],
    set: { status: "cancelled", paymentStatus: "failed", cancellationReason: reason, cancelledAt: new Date(), cancelledBy: adminId },
    notification: { type: notificationType, reason },
  });
  if (!cancelled) throw new ApiError(409, "The booking has already changed and cannot be cancelled");
  return cancelled;
}

export const adminCancelBooking = asyncHandler(async (req, res) => {
  requireTransactionSupport();
  const { bookingId } = req.params;
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (!mongoose.isValidObjectId(bookingId)) throw new ApiError(400, "Invalid booking ID");
  if (reason.length < 3 || reason.length > 500) throw new ApiError(400, "A cancellation reason between 3 and 500 characters is required");
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError(404, "Booking not found");
  const cancelled = await adminCancelBookingRecord(booking, req.user._id, reason);
  const message = cancelled?.paymentStatus === "refund_pending"
    ? "Cancellation recorded. The refund is being processed."
    : cancelled?.paymentStatus === "refund_failed"
      ? "Cancellation recorded, but the refund failed. Safar must review the payment-provider response."
      : "Booking cancellation completed.";
  return res.status(200).json(new ApiResponse(200, { booking: cancelled }, message));
});

export const adminRetryRefund = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  if (!mongoose.isValidObjectId(bookingId)) throw new ApiError(400, "Invalid booking ID");
  if (!isRazorpayApiConfigured()) throw new ApiError(503, "Refund processing is not configured");
  const booking = await Booking.findById(bookingId);
  if (!booking || !booking.razorpayPaymentId) throw new ApiError(404, "Refundable booking not found");
  if (!((booking.status === "refund_pending" || booking.status === "refunded") && booking.paymentStatus === "refund_pending") && booking.paymentStatus !== "refund_failed") {
    throw new ApiError(409, "This booking does not have a retryable refund");
  }

  let payment;
  try {
    payment = await razorpay.payments.fetch(booking.razorpayPaymentId);
  } catch {
    throw new ApiError(503, "The payment provider could not confirm the captured payment. No refund was retried.");
  }
  if (payment.id !== booking.razorpayPaymentId || payment.status !== "captured" || payment.amount !== Math.round(booking.totalAmount * 100) || payment.currency !== "INR") {
    throw new ApiError(409, "The provider has not confirmed a refundable captured payment");
  }

  let retryable = booking;
  if (booking.paymentStatus === "refund_failed") {
    if (!booking.refundId) throw new ApiError(409, "The failed refund has no provider reference and needs manual reconciliation");
    let providerRefund;
    try {
      providerRefund = await razorpay.payments.fetchRefund(payment.id, booking.refundId);
    } catch {
      throw new ApiError(503, "The payment provider could not confirm the prior refund. No duplicate refund was requested.");
    }
    if (providerRefund.payment_id !== payment.id || providerRefund.amount !== Math.round(booking.refundAmount * 100) || providerRefund.status !== "failed") {
      throw new ApiError(409, "The provider has not confirmed that the prior refund failed; retry is blocked to prevent a duplicate refund");
    }
    retryable = await transitionBookingAndQueueNotification({
      filter: { _id: booking._id, status: booking.status, paymentStatus: "refund_failed", refundId: providerRefund.id },
      update: { $set: { status: "refund_pending", paymentStatus: "refund_pending", refundId: null, refundRequestedAt: null, refundRetryAfter: null, refundFailureCode: null }, $inc: { refundAttempt: 1 } },
      type: "refund_pending",
      reason: "Administrator initiated a retry after the payment provider confirmed the prior refund failed",
    });
    if (!retryable) throw new ApiError(409, "The booking changed while the refund retry was being started");
  }

  const result = await requestRefund(retryable, payment, "Administrator refund retry");
  if (!result) throw new ApiError(503, "The refund request is being reconciled with the payment provider");
  const message = result.paymentStatus === "refunded"
    ? "The provider confirmed the refund is complete."
    : result.paymentStatus === "refund_failed"
      ? "The provider rejected the refund again. It remains flagged for manual review."
      : "The refund request is being reconciled with the payment provider.";
  return res.status(result.paymentStatus === "refund_pending" ? 202 : 200).json(new ApiResponse(result.paymentStatus === "refund_pending" ? 202 : 200, { booking: result }, message));
});

export const adminCancelDeparture = asyncHandler(async (req, res) => {
  requireTransactionSupport();
  const { departureId } = req.params;
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (!mongoose.isValidObjectId(departureId)) throw new ApiError(400, "Invalid departure ID");
  if (reason.length < 3 || reason.length > 500) throw new ApiError(400, "A cancellation reason between 3 and 500 characters is required");
  const departure = await Departure.findOneAndUpdate(
    { _id: departureId, status: "scheduled" },
    { $set: { status: "cancelled", cancellationReason: reason, cancelledAt: new Date(), cancelledBy: req.user._id } },
    { new: true }
  );
  if (!departure) throw new ApiError(404, "Scheduled departure not found");
  const affected = await Booking.find({ departure: departureId, status: { $in: ["pending", "confirmed"] } });
  const results = [];
  for (const booking of affected) {
    try {
      results.push(await adminCancelBookingRecord(booking, req.user._id, reason, "departure_cancelled"));
    } catch (error) {
      results.push({ _id: booking._id, status: booking.status, reconciliationRequired: true });
      console.error("Departure cancellation requires booking reconciliation");
      await notifyDepartureCancellation(booking, reason);
    }
  }
  return res.status(200).json(new ApiResponse(200, { departure, bookings: results }, "Departure cancelled. Affected customers are being notified and eligible refunds are being processed."));
});

export const reconcilePaymentStatus = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  if (!mongoose.isValidObjectId(bookingId)) throw new ApiError(400, "Invalid booking ID");
  const booking = await Booking.findOne({ _id: bookingId, user: req.user._id });
  if (!booking) throw new ApiError(404, "Booking not found");
  if (booking.paymentStatus === "paid" && booking.status === "confirmed") {
    return res.status(200).json(new ApiResponse(200, { booking, paymentStatus: "paid" }, "Your booking is confirmed! Your tickets are ready."));
  }
  if (["cancelled", "expired", "failed"].includes(booking.status) && booking.paymentStatus !== "refund_pending") {
    return res.status(200).json(new ApiResponse(200, { booking, paymentStatus: booking.paymentStatus }, booking.status === "expired" ? "Your reservation expired because payment was not completed in time." : bookingPaymentFailureMessage));
  }
  const result = await resolveProviderPayment(booking);
  if (result.state === "captured") {
    const updated = await handleCapturedPaymentForOrder(booking, result.payment);
    return res.status(updated?.status === "confirmed" ? 200 : 202).json(new ApiResponse(updated?.status === "confirmed" ? 200 : 202, { booking: updated, paymentStatus: updated?.paymentStatus }, updated?.status === "confirmed" ? "Your booking is confirmed! Your tickets are ready." : "The payment was captured after the reservation closed. A refund is being processed."));
  }
  if (result.state === "failed" || result.state === "unpaid") {
    const failed = await markPendingPaymentFailed(booking);
    return res.status(200).json(new ApiResponse(200, { booking: failed || booking, paymentStatus: "failed" }, bookingPaymentFailureMessage));
  }
  return res.status(202).json(new ApiResponse(202, { booking, paymentStatus: "pending" }, "Your payment is being processed. Please wait while we confirm your booking."));
});

export async function processExpiredPendingBooking(bookingId, now = new Date()) {
  const booking = await Booking.findOne({ _id: bookingId, status: "pending", paymentStatus: "pending", expiresAt: { $lte: now } });
  if (!booking) return false;
  const providerPayment = await resolveProviderPayment(booking);
  if (providerPayment.state === "pending") return false;
  if (providerPayment.state === "captured") {
    await confirmCapturedPayment(booking, providerPayment.payment);
    return true;
  }
  const expired = await transitionAndReleaseSeats({
    bookingId: booking._id,
    fromStatuses: ["pending"],
    set: { status: "expired", paymentStatus: "failed" },
    now,
    notification: { type: "booking_expired" },
  });
  return Boolean(expired);
}


const paymentOrderResponse = (res, order, message = "Payment order created successfully") =>
  res.status(200).json(new ApiResponse(200, {
    order_id: order.id,
    amount: order.amount,
    currency: order.currency,
    key_id: getRazorpayConfiguration().keyId,
  }, message));

const fetchRazorpayOrderSafely = async (orderId, req, bookingId) => {
  try {
    return await razorpay.orders.fetch(orderId);
  } catch (error) {
    console.error("Safar payment provider request failed", JSON.stringify({
      requestId: req.requestId || "unknown",
      bookingId: String(bookingId),
      operation: "fetch_order",
      errorName: typeof error?.name === "string" ? error.name.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 40) : "Error",
      errorCategory: ["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "ENOTFOUND"].includes(error?.code) ? "network" : "provider",
    }));
    throw new ApiError(502, "The payment provider is temporarily unavailable. Please retry shortly.");
  }
};

const createPaymentOrder = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  if (!mongoose.isValidObjectId(bookingId)) throw new ApiError(400, "Invalid booking ID");
  if (!isRazorpayApiConfigured()) throw new ApiError(503, "Online payment is not configured");

  const booking = await Booking.findOne({ _id: bookingId, user: req.user._id });
  if (!booking) throw new ApiError(404, "Booking not found");
  if (booking.status !== "pending" || booking.paymentStatus !== "pending") {
    throw new ApiError(400, "Booking is not payable");
  }
  if (booking.expiresAt && booking.expiresAt <= new Date()) {
    throw new ApiError(409, "This booking has expired. Start a new booking to reserve seats.");
  }

  // Pending legacy bookings may have been priced from Departure.price. Require review
  // before issuing a new payment order at an amount that differs from today's Trip price.
  const trip = await Trip.findById(booking.trip);
  const currentTripPrice = trip?.basePrice;
  if (typeof currentTripPrice !== "number" || !Number.isFinite(currentTripPrice) || currentTripPrice < 0) {
    throw new ApiError(409, "This booking cannot be paid because the trip price is unavailable. Please contact Safar support.");
  }
  if (booking.pricePerSeat !== currentTripPrice || booking.totalAmount !== currentTripPrice * booking.numberOfSeats) {
    throw new ApiError(409, "This pending booking uses an outdated trip price. Please contact Safar support to review it before paying.");
  }

  const amount = Math.round(booking.totalAmount * 100);
  if (!Number.isSafeInteger(amount) || amount < 100) throw new ApiError(400, "Invalid payment amount");
  if (booking.razorpayOrderId) {
    const existingOrder = await fetchRazorpayOrderSafely(booking.razorpayOrderId, req, booking._id);
    if (existingOrder.id !== booking.razorpayOrderId || existingOrder.amount !== amount || existingOrder.currency !== "INR") {
      throw new ApiError(409, "The existing payment order does not match this booking");
    }
    return paymentOrderResponse(res, existingOrder, "Existing payment order returned");
  }

  const now = new Date();
  const staleLockBefore = new Date(now.getTime() - 2 * 60 * 1000);
  const claimedBooking = await Booking.findOneAndUpdate(
    {
      _id: booking._id,
      user: req.user._id,
      status: "pending",
      paymentStatus: "pending",
      razorpayOrderId: null,
      $or: [
        { razorpayOrderStartedAt: null },
        { razorpayOrderStartedAt: { $exists: false } },
        { razorpayOrderStartedAt: { $lt: staleLockBefore } },
      ],
    },
    { $set: { razorpayOrderStartedAt: now } },
    { new: true }
  );

  if (!claimedBooking) {
    const currentBooking = await Booking.findOne({ _id: booking._id, user: req.user._id });
    if (currentBooking?.razorpayOrderId) {
      const existingOrder = await fetchRazorpayOrderSafely(currentBooking.razorpayOrderId, req, booking._id);
      return paymentOrderResponse(res, existingOrder, "Existing payment order returned");
    }
    throw new ApiError(409, "Payment order is already being prepared. Please retry shortly.");
  }

  try {
    let order;
    try {
      order = await razorpay.orders.create({
        amount,
        currency: "INR",
        receipt: 'booking_' + booking._id,
      });
    } catch (error) {
      console.error("Safar payment provider request failed", JSON.stringify({
        requestId: req.requestId || "unknown",
        bookingId: String(booking._id),
        operation: "create_order",
        errorName: typeof error?.name === "string" ? error.name.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 40) : "Error",
        errorCategory: ["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "ENOTFOUND"].includes(error?.code) ? "network" : "provider",
      }));
      throw new ApiError(502, "The payment provider could not prepare checkout. Please retry shortly.");
    }
    if (!order?.id || order.amount !== amount || order.currency !== "INR") throw new ApiError(502, "The payment provider returned an invalid order");
    const savedBooking = await Booking.findOneAndUpdate(
      { _id: booking._id, user: req.user._id, razorpayOrderStartedAt: now, razorpayOrderId: null },
      { $set: { razorpayOrderId: order.id, razorpayOrderStartedAt: null } },
      { new: true }
    );
    if (!savedBooking) {
      const currentBooking = await Booking.findOne({ _id: booking._id, user: req.user._id });
      if (currentBooking?.razorpayOrderId) {
        const existingOrder = await fetchRazorpayOrderSafely(currentBooking.razorpayOrderId, req, booking._id);
        return paymentOrderResponse(res, existingOrder, "Existing payment order returned");
      }
      throw new ApiError(409, "Payment order could not be saved. Please retry shortly.");
    }
    return paymentOrderResponse(res, order);
  } catch (error) {
    await Booking.updateOne(
      { _id: booking._id, user: req.user._id, razorpayOrderStartedAt: now, razorpayOrderId: null },
      { $set: { razorpayOrderStartedAt: null } }
    );
    throw error;
  }
});


const verifyPayment = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  if (!mongoose.isValidObjectId(bookingId)) throw new ApiError(400, "Invalid booking ID");
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) throw new ApiError(400, "Missing payment verification fields");
  if (!isRazorpayApiConfigured()) throw new ApiError(503, "Online payment verification is not configured");

  const booking = await Booking.findOne({ _id: bookingId, user: req.user._id });
  if (!booking) throw new ApiError(404, "Booking not found");
  if (booking.razorpayOrderId !== razorpay_order_id) throw new ApiError(400, "Order does not match this booking");

  const expectedSignature = crypto.createHmac("sha256", getRazorpayConfiguration().keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`).digest("hex");
  const expected = Buffer.from(expectedSignature, "hex");
  const received = Buffer.from(razorpay_signature, "hex");
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) throw new ApiError(400, "Invalid payment signature");

  if (booking.paymentStatus === "paid" && booking.razorpayPaymentId === razorpay_payment_id) {
    return res.status(200).json(new ApiResponse(200, { booking }, "Your booking is confirmed! Your tickets are ready."));
  }
  let payment;
  try {
    payment = await razorpay.payments.fetch(razorpay_payment_id);
  } catch {
    throw new ApiError(503, "The payment provider could not confirm the payment status. Please retry shortly.");
  }
  if (payment.id !== razorpay_payment_id || payment.order_id !== razorpay_order_id || payment.amount !== Math.round(booking.totalAmount * 100) || payment.currency !== "INR") {
    throw new ApiError(400, "Payment does not match this booking's amount, currency, or order");
  }
  if (payment.status === "failed") {
    const orderState = await resolveProviderPayment(booking);
    if (orderState.state === "captured") {
      const updated = await handleCapturedPaymentForOrder(booking, orderState.payment);
      return res.status(updated?.status === "confirmed" ? 200 : 202).json(new ApiResponse(
        updated?.status === "confirmed" ? 200 : 202,
        { booking: updated, paymentStatus: updated?.paymentStatus },
        updated?.status === "confirmed" ? "Your booking is confirmed! Your tickets are ready." : "The payment was captured after the reservation closed. A refund is being processed."
      ));
    }
    if (orderState.state !== "failed") {
      return res.status(202).json(new ApiResponse(202, { booking, paymentStatus: "pending" }, "Your payment is being processed. Please wait while we confirm your booking."));
    }
    await markPendingPaymentFailed(booking, payment);
    throw new ApiError(409, bookingPaymentFailureMessage);
  }
  if (payment.status !== "captured") {
    return res.status(202).json(new ApiResponse(202, { booking, paymentStatus: "pending" }, "Your payment is being processed. Please wait while we confirm your booking."));
  }
  const confirmed = await handleCapturedPaymentForOrder(booking, payment);
  if (confirmed?.status === "refunded" || confirmed?.status === "refund_pending" || ["refund_pending", "refund_failed"].includes(confirmed?.paymentStatus)) {
    const refundMessage = confirmed.paymentStatus === "refunded"
      ? "Payment was captured after the reservation closed, but the refund has been successfully processed. No ticket was issued."
      : confirmed.paymentStatus === "refund_failed"
      ? "The payment was captured after the reservation closed. The refund is not yet complete and requires follow-up."
      : "The payment was captured after the reservation closed. A refund is being processed.";
    return res.status(202).json(new ApiResponse(202, { booking: confirmed, paymentStatus: confirmed.paymentStatus }, refundMessage));
  }
  return res.status(200).json(new ApiResponse(200, { booking: confirmed }, "Your booking is confirmed! Your tickets are ready."));
});

async function claimWebhookEvent(eventId, eventName, payloadHash) {
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + 2 * 60 * 1000);
  const existing = await PaymentWebhookEvent.findOne({ eventId });
  if (!existing) {
    try {
      await PaymentWebhookEvent.create({ eventId, event: eventName, payloadHash, status: "processing", leaseExpiresAt });
      return "claimed";
    } catch (error) {
      if (error?.code !== 11000) throw error;
      return claimWebhookEvent(eventId, eventName, payloadHash);
    }
  }
  if (existing.payloadHash !== payloadHash || existing.event !== eventName) {
    throw new ApiError(409, "Payment webhook event identifier was reused with a different payload");
  }
  if (existing.status === "processed") return "processed";
  if (existing.status === "processing" && existing.leaseExpiresAt > now) return "busy";

  const claimed = await PaymentWebhookEvent.findOneAndUpdate(
    { _id: existing._id, payloadHash, $or: [{ status: "failed" }, { status: "processing", leaseExpiresAt: { $lte: now } }, { status: "processing", leaseExpiresAt: null }] },
    { $set: { status: "processing", leaseExpiresAt }, $inc: { attempts: 1 }, $unset: { lastErrorCode: 1 } },
    { new: true }
  );
  return claimed ? "claimed" : "busy";
}

const safeWebhookErrorCode = (error) => /^[A-Za-z0-9_-]{1,64}$/.test(String(error?.code || ""))
  ? String(error.code)
  : "processing_failed";

const handlePaymentWebhook = asyncHandler(async (req, res) => {
  let webhookSecret;
  try {
    webhookSecret = getRazorpayConfiguration().webhookSecret;
  } catch {
    throw new ApiError(503, "Payment webhook verification is not configured");
  }
  const signature = req.get("x-razorpay-signature");
  if (!webhookSecret || !req.rawBody || !signature) {
    throw new ApiError(503, "Payment webhook verification is not configured");
  }

  const expectedSignature = crypto.createHmac("sha256", webhookSecret).update(req.rawBody).digest("hex");
  const expected = Buffer.from(expectedSignature, "hex");
  const received = Buffer.from(signature, "hex");
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    throw new ApiError(400, "Invalid payment webhook signature");
  }

  const { event, payload } = req.body || {};
  const eventName = typeof event === "string" && event.length <= 100 ? event : "unknown";
  const payloadHash = crypto.createHash("sha256").update(req.rawBody).digest("hex");
  const suppliedEventId = req.get("x-razorpay-event-id");
  if (suppliedEventId && (typeof suppliedEventId !== "string" || suppliedEventId.length > 255)) {
    throw new ApiError(400, "Invalid payment webhook event identifier");
  }
  const eventId = suppliedEventId || `body-sha256:${payloadHash}`;
  const claim = await claimWebhookEvent(eventId, eventName, payloadHash);
  if (claim === "processed") {
    return res.status(200).json(new ApiResponse(200, { received: true }, "Payment webhook already processed"));
  }
  if (claim === "busy") {
    throw new ApiError(409, "This payment webhook event is already being processed; retry shortly");
  }

  try {
    if (eventName === "refund.processed" || eventName === "refund.failed") {
      const refund = payload?.refund?.entity;
      if (!refund?.id || !refund?.payment_id || !Number.isFinite(refund?.amount)) throw new ApiError(400, "Invalid refund webhook payload");
      const prior = await Booking.findOne({ $or: [{ refundId: refund.id }, { razorpayPaymentId: refund.payment_id }] });
      if (!prior) throw new ApiError(404, "Booking for refund was not found");
      const alreadyNotified = eventName === "refund.processed"
        ? prior.paymentStatus === "refunded" && prior.refundId === refund.id
        : prior.paymentStatus === "refund_failed" && prior.refundId === refund.id;
      const updated = await reconcileRefundWebhook(refund, eventName);
      if (updated && !alreadyNotified) await notifyCustomer(updated, {
        refundProcessed: eventName === "refund.processed" && updated.paymentStatus === "refunded",
        refundPending: eventName !== "refund.processed" && updated.paymentStatus === "refund_pending",
        refundFailed: eventName === "refund.failed",
        reason: updated.cancellationReason || "Booking cancellation",
      });
    } else if (eventName === "payment.captured") {
      const payment = payload?.payment?.entity;
      if (!payment?.id || !payment?.order_id || !Number.isFinite(payment?.amount) || payment?.currency !== "INR" || payment?.status !== "captured") {
        throw new ApiError(400, "Invalid captured payment payload");
      }

      const booking = await Booking.findOne({ razorpayOrderId: payment.order_id });
      if (!booking) throw new ApiError(404, "Booking for payment order not found");
      if (booking.paymentStatus === "paid" && booking.razorpayPaymentId === payment.id) {
        await PaymentWebhookEvent.updateOne({ eventId, status: "processing" }, { $set: { status: "processed", processedAt: new Date(), leaseExpiresAt: null } });
        return res.status(200).json(new ApiResponse(200, { received: true }, "Payment webhook already processed"));
      }
      if (booking.paymentStatus === "paid" && booking.razorpayPaymentId !== payment.id) {
        throw new ApiError(409, "A different payment has already been recorded for this booking");
      }

      const expectedAmount = Math.round(booking.totalAmount * 100);
      if (payment.amount !== expectedAmount) throw new ApiError(400, "Payment amount does not match booking total");
      const updated = await confirmCapturedPayment(booking, payment);
      const webhookMessage = updated?.status === "confirmed"
        ? "Payment confirmed from verified webhook"
        : updated?.paymentStatus === "refunded"
          ? "Late payment received and refund processed"
          : updated?.paymentStatus === "refund_failed"
            ? "Late payment received; refund requires reconciliation"
            : "Late payment received; refund processing has started";
      await PaymentWebhookEvent.updateOne({ eventId, status: "processing" }, { $set: { status: "processed", processedAt: new Date(), leaseExpiresAt: null } });
      return res.status(200).json(new ApiResponse(200, { received: true, bookingStatus: updated?.status, paymentStatus: updated?.paymentStatus }, webhookMessage));
    } else if (eventName === "payment.failed") {
      const payment = payload?.payment?.entity;
      if (!payment?.id || !payment?.order_id || !Number.isFinite(payment?.amount) || payment?.currency !== "INR" || payment?.status !== "failed") {
        throw new ApiError(400, "Invalid failed payment payload");
      }
      const booking = await Booking.findOne({ razorpayOrderId: payment.order_id });
      if (!booking) throw new ApiError(404, "Booking for payment order not found");
      if (payment.amount !== Math.round(booking.totalAmount * 100)) throw new ApiError(400, "Payment amount does not match booking total");

      // A failed attempt is not necessarily a failed order. Reconcile every attempt
      // before releasing the reservation so a captured or pending attempt wins.
      if (booking.paymentStatus === "paid" || booking.status !== "pending" || booking.paymentStatus !== "pending") {
        await PaymentWebhookEvent.updateOne({ eventId, status: "processing" }, { $set: { status: "processed", processedAt: new Date(), leaseExpiresAt: null } });
        return res.status(200).json(new ApiResponse(200, { received: true, bookingStatus: booking.status, paymentStatus: booking.paymentStatus }, "Payment failure did not change the current booking state"));
      }
      const orderState = await resolveProviderPayment(booking);
      if (orderState.state === "captured") {
        const updated = await handleCapturedPaymentForOrder(booking, orderState.payment);
        await PaymentWebhookEvent.updateOne({ eventId, status: "processing" }, { $set: { status: "processed", processedAt: new Date(), leaseExpiresAt: null } });
        return res.status(200).json(new ApiResponse(200, { received: true, bookingStatus: updated?.status, paymentStatus: updated?.paymentStatus }, "Captured payment reconciled despite a failed payment attempt"));
      }
      if (orderState.state === "failed") await markPendingPaymentFailed(booking, payment);
      await PaymentWebhookEvent.updateOne({ eventId, status: "processing" }, { $set: { status: "processed", processedAt: new Date(), leaseExpiresAt: null } });
      return res.status(200).json(new ApiResponse(200, { received: true, bookingStatus: booking.status, paymentStatus: orderState.state === "failed" ? "failed" : "pending" }, orderState.state === "failed" ? "Definitive payment failure recorded" : "Payment remains pending; reservation retained"));
    }

    await PaymentWebhookEvent.updateOne(
      { eventId, status: "processing" },
      { $set: { status: "processed", processedAt: new Date(), leaseExpiresAt: null } }
    );
    const message = eventName === "refund.processed"
      ? "Refund confirmation processed"
      : eventName === "refund.failed"
        ? "Refund failure recorded"
        : "Webhook acknowledged";
    return res.status(200).json(new ApiResponse(200, { received: true }, message));
  } catch (error) {
    await PaymentWebhookEvent.updateOne(
      { eventId, status: "processing" },
      { $set: { status: "failed", leaseExpiresAt: null, lastErrorCode: safeWebhookErrorCode(error) } }
    );
    throw error;
  }
});
export { createBooking, getMyBookings, cancelBooking, createPaymentOrder, verifyPayment, handlePaymentWebhook, claimWebhookEvent };
