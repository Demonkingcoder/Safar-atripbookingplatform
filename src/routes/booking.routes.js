import { Router } from "express";
import {
  createBooking,
  getMyBookings,
  cancelBooking,
  createPaymentOrder,
  verifyPayment,
  handlePaymentWebhook,
  adminCancelBooking,
  adminRetryRefund,
  reconcilePaymentStatus
} from "../controllers/bookingController.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { requireAdmin } from "../middlewares/requireAdmin.middleware.js";
import { verifySameOrigin } from "../middlewares/csrf.middleware.js";

const router = Router();

router.post("/webhook", handlePaymentWebhook);

router.use(verifyJWT);

router.post("/", verifySameOrigin, createBooking);
router.get("/my-bookings", getMyBookings);
router.patch("/:bookingId/cancel", verifySameOrigin, cancelBooking);
router.post("/:bookingId/payment-order", verifySameOrigin, createPaymentOrder);
router.post("/:bookingId/verify-payment", verifySameOrigin, verifyPayment);
router.post("/:bookingId/reconcile-payment", verifySameOrigin, reconcilePaymentStatus);
router.patch("/admin/:bookingId/cancel", verifySameOrigin, requireAdmin, adminCancelBooking);
router.post("/admin/:bookingId/refund/retry", verifySameOrigin, requireAdmin, adminRetryRefund);

export default router;
