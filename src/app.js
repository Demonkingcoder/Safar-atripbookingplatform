import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

const app = express();

// Basic configurations
app.use(express.json({ limit: "32kb", verify: (req, res, buffer) => { req.rawBody = Buffer.from(buffer); } }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));
app.use(cookieParser());

// Credentialed CORS uses explicit origins; a wildcard cannot be combined with cookies.
const configuredOrigins = (process.env.CORS_ORIGIN || process.env.CORS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin && origin !== "*");
if (configuredOrigins.length === 0) {
    configuredOrigins.push(process.env.FRONTEND_URL || "http://localhost:5173");
}
const allowedOrigins = configuredOrigins.map((origin) => {
    try { return new URL(origin).origin; } catch { return origin.replace(/\/$/, ""); }
});

app.use(cors({
    origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key", "X-Razorpay-Signature"],
}));
// Import routes
import healthCheckRouter from "./routes/healthCheck.routes.js";
import authRouter from "./routes/auth.routes.js";
import { errorHandler } from "./middlewares/error.middleware.js";
import tripRouter from "./routes/trip.routes.js";
import departureRouter from "./routes/departure.routes.js";
import bookingRouter from "./routes/booking.routes.js";

// Mount routes
app.use("/api/v1/healthcheck", healthCheckRouter);
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/trips", tripRouter);
app.use("/api/v1/departures", departureRouter);
app.use("/api/v1/bookings", bookingRouter);

// Centralized error handler
app.use(errorHandler);

export default app;