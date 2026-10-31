import "dotenv/config";

import app from "./app.js";
import connectDB from "./db/index.js";
import { expirePendingBookings } from "./utils/booking-expiration.js";
import { startNotificationOutboxWorker } from "./utils/notification-outbox.js";
import { validateRuntimeConfiguration } from "./utils/runtime-configuration.js";

const port = Number(process.env.PORT) || 3000;

try {
  validateRuntimeConfiguration("api");
} catch (error) {
  console.error(
    "Safar API configuration check failed:",
    error.message
  );
  process.exit(1);
}

async function startServer() {
  try {
    await connectDB();

    const server = app.listen(port, () => {
      console.log(`Safar API listening on port ${port}`);
    });

    server.on("error", (error) => {
      console.error("Safar API server error:", error.message);
      process.exit(1);
    });

    // Start the notification outbox worker unless explicitly disabled.
    if (process.env.RUN_NOTIFICATION_WORKER !== "false") {
      startNotificationOutboxWorker();
      console.log("Notification outbox worker started");
    }

    // Periodically expire pending bookings.
    const expiryTimer = setInterval(() => {
      expirePendingBookings().catch((error) => {
        console.error(
          "Booking expiry job failed:",
          error.message
        );
      });
    }, 60 * 1000);

    // Allow Node.js to exit naturally if nothing else is running.
    expiryTimer.unref();

    console.log("Safar API startup completed");
  } catch (error) {
    console.error("Safar API startup failed:", error.message);
    process.exit(1);
  }
}

startServer();