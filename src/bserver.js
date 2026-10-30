import "dotenv/config";
import app from "./app.js";
import connectDB from "./db/index.js";
import { expirePendingBookings } from "./utils/booking-expiration.js";
import { startNotificationOutboxWorker } from "./utils/notification-outbox.js";

const port = process.env.PORT || 3000;

connectDB()
  .then(()=>{
    app.listen(port, ()=>{
        console.log(`Safar API listening on port ${port}`);
    });
    if (process.env.RUN_NOTIFICATION_WORKER !== "false") startNotificationOutboxWorker();
    const expiryTimer = setInterval(() => {
      expirePendingBookings().catch((error) => console.error("Booking expiry job failed:", error.message));
    }, 60 * 1000);
    expiryTimer.unref();
  })
  .catch((err) => {
    console.error("MongoDB connection error", err);
    process.exit(1);
  });
