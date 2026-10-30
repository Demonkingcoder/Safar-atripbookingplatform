import "dotenv/config";
import mongoose from "mongoose";
import Booking from "../models/Booking.js";
import NotificationOutbox from "../models/NotificationOutbox.js";
import PaymentWebhookEvent from "../models/PaymentWebhookEvent.js";
import RefreshSession from "../models/RefreshSession.js";
import Trip from "../models/Trip.js";
import User from "../models/User.js";
import { findUniqueIndexConflicts } from "../utils/index-preflight.js";

const models = { Booking, NotificationOutbox, PaymentWebhookEvent, RefreshSession, Trip, User };

try {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10_000 });
  const conflicts = await findUniqueIndexConflicts(models);
  if (conflicts.length) {
    console.error("Unique index preflight found duplicate groups:");
    for (const conflict of conflicts) console.error(`- ${conflict.index}: ${conflict.duplicateGroups} duplicate group(s)`);
    process.exitCode = 1;
  } else {
    console.log("Unique index preflight passed; no duplicate groups were found.");
  }
} catch (error) {
  console.error("Unique index preflight could not complete:", error?.name || "DatabaseError");
  process.exitCode = 1;
} finally {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
}
