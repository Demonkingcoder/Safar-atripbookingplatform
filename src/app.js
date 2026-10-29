import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

const app = express();

// Basic configurations
app.use(express.json({ limit: "32kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));
app.use(cookieParser());

// CORS configuration
app.use(
    cors({
        origin: process.env.CORS_ORIGIN?.split(",") || ["http://localhost:5173"],
        credentials: true,
        methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"]
    })
);

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
app.use("api/v1/trips", tripRouter);
app.use("/api/v1/departures", departureRouter);
app.use("/api/v1/bookings", bookingRouter);

// Centralized error handler
app.use(errorHandler);

export default app;