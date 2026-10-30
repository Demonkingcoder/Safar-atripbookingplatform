import crypto from "node:crypto";
import mongoose from "mongoose";
import Booking from "../models/Booking.js";
import Departure from "../models/Departure.js";
import NotificationOutbox from "../models/NotificationOutbox.js";
import Trip from "../models/Trip.js";
import User from "../models/User.js";
import { buildBookingNotificationEmail } from "./booking-notification-email.js";
import { sendEmail } from "./mail.js";
import { requireTransactionSupport, transactionUnavailableError } from "./transaction-support.js";
import NotificationWorkerHeartbeat from "../models/NotificationWorkerHeartbeat.js";

const MAX_ATTEMPTS = 8;
const LOCK_MS = 2 * 60 * 1000;
const LOCK_RENEWAL_INTERVAL_MS = 30 * 1000;
export function notificationEventKey(booking, type) {
  return `booking:${booking._id}:${type}`;
}

export async function createNotificationOutboxRecord({ eventKey, type, booking, user = null, recipientEmail = null, reason = "", session }) {
  if (!eventKey || !booking?._id) return false;
  await NotificationOutbox.updateOne(
    { eventKey },
    { $setOnInsert: { eventKey, type, user, recipientEmail, booking: booking._id, reason: String(reason || "").slice(0, 500), status: "pending", attempts: 0, nextAttemptAt: new Date() } },
    { upsert: true, ...(session ? { session } : {}) }
  );
  return true;
}

export async function createBookingNotificationOutboxRecord(booking, type, reason = "", session) {
  if (!booking?._id || !booking?.user) return false;
  const eventKey = notificationEventKey(booking, type);
  await NotificationOutbox.updateOne(
    { eventKey },
    { $setOnInsert: { eventKey, type, user: booking.user, booking: booking._id, reason: String(reason || "").slice(0, 500), status: "pending", attempts: 0, nextAttemptAt: new Date() } },
    { upsert: true, ...(session ? { session } : {}) }
  );
  return true;
}

export async function createAdminNotificationOutboxRecords(booking, reason = "", session) {
  if (!booking?._id) return 0;
  const recipients = (process.env.SAFAR_ADMIN_NOTIFICATION_EMAILS || "")
    .split(",").map((email) => email.trim().toLowerCase()).filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  for (const recipientEmail of new Set(recipients)) {
    const recipientKey = crypto.createHash("sha256").update(recipientEmail).digest("hex").slice(0, 24);
    const eventKey = `admin:booking:${booking._id}:confirmed:${recipientKey}`;
    await createNotificationOutboxRecord({ eventKey, type: "admin_booking_notification", booking, recipientEmail, reason, session });
  }
  return recipients.length;
}

export async function transitionBookingAndQueueNotification({ filter, update, type, reason = "", administratorNotice = false }) {
  requireTransactionSupport();
  const session = await mongoose.startSession();
  let booking = null;
  try {
    await session.withTransaction(async () => {
      booking = await Booking.findOneAndUpdate(filter, update, { new: true, session });
      if (!booking) return;
      for (const notificationType of (Array.isArray(type) ? type : type ? [type] : [])) {
        await createBookingNotificationOutboxRecord(booking, notificationType, reason, session);
      }
      if (administratorNotice) await createAdminNotificationOutboxRecords(booking, reason, session);
    });
    return booking;
  } catch (error) {
    throw transactionUnavailableError(error);
  } finally {
    await session.endSession();
  }
}

export async function enqueueBookingNotification(booking, type, reason = "") {
  if (!booking?._id || !booking?.user || mongoose.connection.readyState !== 1) return false;
  try {
    await createBookingNotificationOutboxRecord(booking, type, reason);
    return true;
  } catch {
    // The worker's recent-booking reconciliation retries outbox creation after the state commit.
    console.error("Safar notification could not be queued");
    return false;
  }
}

function notificationForBooking(booking) {
  if (booking.status === "confirmed" && booking.paymentStatus === "paid") return "booking_confirmed";
  if (booking.status === "expired") return "booking_expired";
  if (booking.status === "failed" || booking.paymentStatus === "failed") return "payment_failed";
  if (booking.paymentStatus === "refund_pending" || booking.status === "refund_pending") return "refund_pending";
  if (booking.paymentStatus === "refund_failed") return "refund_failed";
  if (booking.paymentStatus === "refunded" || booking.status === "refunded") return "refund_processed";
  if (booking.status === "cancelled") return "booking_cancelled";
  return null;
}

export async function reconcileRecentBookingNotifications(now = new Date()) {
  if (mongoose.connection.readyState !== 1) return 0;
  const recent = await Booking.find({
    status: { $in: ["confirmed", "cancelled", "failed", "expired", "refund_pending", "refunded"] },
    updatedAt: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
  }).sort({ updatedAt: -1 }).limit(250).lean();
  let queued = 0;
  for (const booking of recent) {
    const type = notificationForBooking(booking);
    if (type && await enqueueBookingNotification(booking, type, booking.cancellationReason || "")) queued += 1;
  }
  return queued;
}

export async function enqueueUpcomingTripReminders(now = new Date()) {
  if (mongoose.connection.readyState !== 1) return 0;
  const reminderWindow = 7 * 24 * 60 * 60 * 1000;
  const departureQuery = Departure.find({ status: "scheduled", startDate: { $gt: now, $lte: new Date(now.getTime() + reminderWindow) } });
  const departureSelected = departureQuery.select ? departureQuery.select("_id") : departureQuery;
  const departures = departureSelected.lean ? await departureSelected.lean() : await departureSelected;
  if (!departures?.length) return 0;
  const query = Booking.find({ departure: { $in: departures.map((departure) => departure._id) }, status: "confirmed", paymentStatus: "paid" });
  const bookings = query.lean ? await query.lean() : await query;
  let queued = 0;
  for (const booking of bookings || []) {
    if (await enqueueBookingNotification(booking, "upcoming_trip_reminder")) queued += 1;
  }
  return queued;
}

function safeErrorCode(error) {
  return /^[A-Za-z0-9_-]{1,64}$/.test(String(error?.code || "")) ? String(error.code) : "delivery_failed";
}

async function loadSelected(query, fields) {
  return query?.select ? query.select(fields) : query;
}

async function recordWorkerProgress(fields) {
  try {
    await NotificationWorkerHeartbeat.updateOne(
      { _id: "notification-outbox" },
      { $set: { lastHeartbeatAt: new Date(), ...fields } },
      { upsert: true }
    );
  } catch {
    console.error("Safar notification worker progress could not be stored");
  }
}

export async function renewNotificationJobLease(jobId, lockToken, leaseMs = LOCK_MS) {
  const renewedAt = new Date();
  const lockedUntil = new Date(renewedAt.getTime() + leaseMs);
  const result = await NotificationOutbox.updateOne(
    { _id: jobId, status: "processing", lockToken, $expr: { $gt: ["$lockedUntil", "$$NOW"] } },
    [{ $set: { lockedUntil: { $add: ["$$NOW", leaseMs] } } }]
  );
  if (result.matchedCount === 1) {
    await recordWorkerProgress({ currentLeaseUntil: lockedUntil, lastLeaseRenewalAt: renewedAt });
    return true;
  }
  return false;
}

function requireRecipientAcceptance(result, recipientEmail) {
  if (!Array.isArray(result?.accepted) && !Array.isArray(result?.rejected)) return;
  const normalize = (recipient) => String(typeof recipient === "string" ? recipient : recipient?.address || "").trim().toLowerCase();
  const email = recipientEmail.trim().toLowerCase();
  const accepted = (result.accepted || []).some((recipient) => normalize(recipient) === email);
  const rejected = (result.rejected || []).some((recipient) => normalize(recipient) === email);
  if (rejected || !accepted) {
    const error = new Error("SMTP did not accept the notification recipient");
    error.code = "recipient_not_accepted";
    throw error;
  }
}

export async function processNotificationOutboxBatch({ mailSender = sendEmail, batchSize = 10, lockMs = LOCK_MS, leaseRenewalIntervalMs = LOCK_RENEWAL_INTERVAL_MS } = {}) {
  if (mongoose.connection.readyState !== 1) return 0;
  const renewalInterval = Math.max(1, Math.min(leaseRenewalIntervalMs, Math.floor(lockMs / 3)));
  let processed = 0;
  for (let index = 0; index < batchSize; index += 1) {
    const lockToken = crypto.randomUUID();
    const job = await NotificationOutbox.findOneAndUpdate(
      { $or: [
        { status: "pending", $expr: { $lte: ["$nextAttemptAt", "$$NOW"] } },
        { status: "processing", $or: [
          { lockedUntil: null },
          { $expr: { $lte: ["$lockedUntil", "$$NOW"] } },
        ] },
      ] },
      [{ $set: {
        status: "processing",
        lockedUntil: { $add: ["$$NOW", lockMs] },
        lockToken,
        attempts: { $add: [{ $ifNull: ["$attempts", 0] }, 1] },
      } }],
      { new: true, sort: { nextAttemptAt: 1, createdAt: 1 } }
    );
    if (!job) break;

    const claimedAt = new Date();
    const jobId = String(job._id);
    let leaseLost = false;
    let renewalQueue = Promise.resolve();
    await recordWorkerProgress({
      state: "healthy",
      currentProcessingState: "processing",
      currentJobId: jobId,
      currentJobStartedAt: claimedAt,
      currentLeaseUntil: new Date(claimedAt.getTime() + lockMs),
      lastSuccessfulClaimAt: claimedAt,
      lastErrorCode: null,
    });
    const renewalTimer = setInterval(() => {
      renewalQueue = renewalQueue.then(async () => {
        if (leaseLost) return;
        try {
          const renewed = await renewNotificationJobLease(job._id, lockToken, lockMs);
          if (!renewed) {
            leaseLost = true;
            await recordWorkerProgress({ currentProcessingState: "lease_lost", lastErrorCode: "outbox_lease_lost" });
          }
        } catch {
          // Retry on the next tick while the current lease remains valid.
          console.error("Safar notification lease renewal failed");
        }
      });
    }, renewalInterval);

    try {
      try {
        const userQuery = job.recipientEmail ? null : User.findById(job.user);
        const bookingQuery = Booking.findById(job.booking);
        const [user, booking] = await Promise.all([
          job.recipientEmail ? { email: job.recipientEmail, fullName: "Safar team" } : loadSelected(userQuery, "email fullName"),
          loadSelected(bookingQuery, "trip departure bookingReference numberOfSeats totalAmount refundAmount cancellationReason"),
        ]);
        if (!user?.email || !booking) {
          const completion = await NotificationOutbox.updateOne(
            { _id: job._id, lockToken },
            { $set: { status: "dead", lockedUntil: null, lockToken: null, lastErrorCode: "recipient_or_booking_unavailable" } }
          );
          if (completion.matchedCount === 1) await recordWorkerProgress({
            currentProcessingState: "idle", currentJobId: null, currentJobStartedAt: null, currentLeaseUntil: null,
            lastAttemptCompletedAt: new Date(), lastJobOutcome: "dead", lastErrorCode: "recipient_or_booking_unavailable",
          });
          processed += 1;
          continue;
        }
        const [tripQuery, departureQuery] = [Trip.findById(booking.trip), Departure.findById(booking.departure)];
        const [trip, departure] = await Promise.all([
          loadSelected(tripQuery, "title"),
          loadSelected(departureQuery, "startDate"),
        ]);
        if (leaseLost) {
          await recordWorkerProgress({
            currentProcessingState: "idle", currentJobId: null, currentJobStartedAt: null, currentLeaseUntil: null,
            lastErrorCode: "outbox_lease_lost",
          });
          processed += 1;
          continue;
        }
        const message = buildBookingNotificationEmail({
          type: job.type,
          fullName: user.fullName,
          tripTitle: trip?.title,
          bookingReference: booking.bookingReference || String(booking._id),
          numberOfSeats: booking.numberOfSeats,
          totalAmount: job.type.startsWith("refund_") ? (booking.refundAmount ?? booking.totalAmount) : booking.totalAmount,
          departureDate: departure?.startDate,
          reason: job.reason || booking.cancellationReason,
        });
        const messageId = `<safar-${crypto.createHash("sha256").update(job.eventKey).digest("hex")}@notifications.safar>`;
        const delivery = await mailSender({ email: user.email, subject: message.subject, htmlContent: message.htmlContent, textContent: message.textContent, messageId });
        requireRecipientAcceptance(delivery, user.email);
        const completion = await NotificationOutbox.updateOne(
          { _id: job._id, lockToken },
          { $set: { status: "sent", sentAt: new Date(), lockedUntil: null, lockToken: null, lastErrorCode: null } }
        );
        if (completion.matchedCount === 1) await recordWorkerProgress({
          currentProcessingState: "idle", currentJobId: null, currentJobStartedAt: null, currentLeaseUntil: null,
          lastAttemptCompletedAt: new Date(), lastSuccessfulCompletionAt: new Date(), lastJobOutcome: "sent", lastErrorCode: null,
        });
      } catch (error) {
        const attempts = Number(job.attempts) || 1;
        const dead = attempts >= MAX_ATTEMPTS;
        const backoffMs = Math.min(6 * 60 * 60 * 1000, 30 * 1000 * (2 ** Math.min(attempts - 1, 10)));
        const retryAt = new Date(Date.now() + backoffMs);
        const completion = await NotificationOutbox.updateOne(
          { _id: job._id, lockToken },
          { $set: {
            status: dead ? "dead" : "pending",
            nextAttemptAt: retryAt,
            lockedUntil: null,
            lockToken: null,
            lastErrorCode: safeErrorCode(error),
          } }
        );
        if (completion.matchedCount === 1) await recordWorkerProgress({
          currentProcessingState: "idle", currentJobId: null, currentJobStartedAt: null, currentLeaseUntil: null,
          lastAttemptCompletedAt: new Date(), lastJobOutcome: dead ? "dead" : "retry", lastErrorCode: safeErrorCode(error),
        });
        console.error(dead ? "Safar notification moved to dead-letter state" : "Safar notification delivery will retry");
      }
    } catch (error) {
      console.error("Safar notification job processing failed", safeErrorCode(error));
    } finally {
      clearInterval(renewalTimer);
      await renewalQueue;
    }
    processed += 1;
  }
  return processed;
}

export function startNotificationOutboxWorker() {
  let processing = false;
  let activeRun = Promise.resolve();
  let lastMaintenanceAt = 0;
  let state = "starting";
  let lastErrorCode = null;
  const heartbeat = async () => {
    try {
      await NotificationWorkerHeartbeat.updateOne(
        { _id: "notification-outbox" },
        { $set: { state, lastHeartbeatAt: new Date(), lastErrorCode } },
        { upsert: true }
      );
    } catch {
      console.error("Safar notification worker heartbeat could not be stored");
    }
  };
  const run = () => {
    if (processing) return activeRun;
    processing = true;
    const passStartedAt = new Date();
    void recordWorkerProgress({ state: "healthy", currentProcessingState: "polling", lastPassStartedAt: passStartedAt, lastErrorCode: null });
    activeRun = (async () => {
      try {
        await processNotificationOutboxBatch();
        if (Date.now() - lastMaintenanceAt >= 60_000) {
          await reconcileRecentBookingNotifications();
          await enqueueUpcomingTripReminders();
          lastMaintenanceAt = Date.now();
        }
        state = "healthy";
        lastErrorCode = null;
      } catch (error) {
        state = "degraded";
        lastErrorCode = safeErrorCode(error);
        console.error("Safar notification worker pass failed", lastErrorCode);
      } finally {
        await recordWorkerProgress({
          state,
          currentProcessingState: state === "degraded" ? "degraded" : "idle",
          lastPassCompletedAt: new Date(),
          lastErrorCode,
        });
        processing = false;
      }
    })();
    return activeRun;
  };
  const timer = setInterval(run, 5_000);
  const heartbeatTimer = setInterval(heartbeat, 10_000);
  run();
  return async () => {
    clearInterval(timer);
    clearInterval(heartbeatTimer);
    await activeRun;
  };
}
