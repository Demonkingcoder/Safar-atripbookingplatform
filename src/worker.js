import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "./db/index.js";
import { startNotificationOutboxWorker } from "./utils/notification-outbox.js";
import { validateRuntimeConfiguration } from "./utils/runtime-configuration.js";

try {
  validateRuntimeConfiguration("worker");
} catch (error) {
  console.error("Safar notification worker configuration check failed:", error.message);
  process.exit(1);
}
await connectDB();
const stopWorker = startNotificationOutboxWorker();

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Safar notification worker received ${signal}`);
  await stopWorker();
  await mongoose.disconnect();
  process.exit(0);
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
