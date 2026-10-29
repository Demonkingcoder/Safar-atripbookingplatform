import { Router } from "express";
import {
  createBooking,
  getMyBookings,
  cancelBooking,
  createPaymentOrder,
  verifyPayment
} from "../controllers/bookingController.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(verifyJWT);

router.post("/", createBooking);
router.get("/my-bookings", getMyBookings);
router.patch("/:bookingId/cancel", cancelBooking);
router.post("/:bookingId/payment-order", createPaymentOrder);
router.post("/:bookingId/verify-payment", verifyPayment);

export default router;
