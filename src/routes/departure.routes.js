
import { Router } from "express";
import { getTripDepartures } from "../controllers/departureController.js";
import { adminCancelDeparture } from "../controllers/bookingController.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { requireAdmin } from "../middlewares/requireAdmin.middleware.js";
import { verifySameOrigin } from "../middlewares/csrf.middleware.js";

const router = Router();

router.get("/:slug/departures", getTripDepartures);
router.patch("/:departureId/cancel", verifyJWT, verifySameOrigin, requireAdmin, adminCancelDeparture);

export default router;
