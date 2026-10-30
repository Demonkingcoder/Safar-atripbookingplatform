import mongoose from "mongoose";
import dns from "dns";
import { detectTransactionSupport } from "../utils/transaction-support.js";
import PaymentWebhookEvent from "../models/PaymentWebhookEvent.js";
import NotificationOutbox from "../models/NotificationOutbox.js";
import Departure from "../models/Departure.js";
import NotificationWorkerHeartbeat from "../models/NotificationWorkerHeartbeat.js";
import Booking from "../models/Booking.js";
import User from "../models/User.js";
import RefreshSession from "../models/RefreshSession.js";
import Trip from "../models/Trip.js";

// Ensure reliable DNS resolution for mongodb+srv URLs across all ISPs
try {
    dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch {
    // DNS settings may be managed by the host environment.
}

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("MongoDB connected");
        const supportsTransactions = await detectTransactionSupport(mongoose.connection);
        await Promise.all([
            Booking.createIndexes(),
            User.createIndexes(),
            RefreshSession.createIndexes(),
            Trip.createIndexes(),
            Departure.createIndexes(),
            PaymentWebhookEvent.createIndexes(),
            NotificationOutbox.createIndexes(),
            NotificationWorkerHeartbeat.createIndexes(),
        ]);
        if (!supportsTransactions) {
            console.warn("MongoDB standalone detected; booking and cancellation inventory operations will fail closed until a replica set is configured.");
        }
    } catch (error) {
        console.error("MongoDB connection or capability check failed", error?.name || "DatabaseError");
        process.exit(1);
    }
};

export default connectDB;
