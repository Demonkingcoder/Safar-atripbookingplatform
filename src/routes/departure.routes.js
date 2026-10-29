
import { Router } from "express";
import { getTripDepartures } from "../controllers/departureController.js";

const router = Router();

router.get("/:slug/departures", getTripDepartures);

export default router;
