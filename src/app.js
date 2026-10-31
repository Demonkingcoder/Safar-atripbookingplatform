import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { requestIdMiddleware } from "./middlewares/request-id.middleware.js";

const app = express();

// Basic configurations
app.use(requestIdMiddleware);
app.use(express.json({ limit: "32kb", verify: (req, res, buffer) => { req.rawBody = Buffer.from(buffer); } }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));
app.use(cookieParser());
app.set("trust proxy", 1);

const allowedOrigins = [
  "https://safar-atripbookingplatform.vercel.app",
];

app.use(
  cors({
    origin(origin, callback) {
      const isAllowed =
        !origin ||
        allowedOrigins.includes(origin) ||
        /^https:\/\/safar-atripbookingplatform(?:-[a-z0-9-]+)?-demonkingcoder\.vercel\.app$/.test(origin);

      callback(isAllowed ? null : new Error("Origin not allowed by CORS"), isAllowed);
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Idempotency-Key",
      "X-Razorpay-Signature",
    ],
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
app.use("/api/v1/trips", tripRouter);
app.use("/api/v1/departures", departureRouter);
app.use("/api/v1/bookings", bookingRouter);

// Centralized error handler
app.use(errorHandler);

export default app;
