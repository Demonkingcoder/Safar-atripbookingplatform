import { getAllTrips,getTripBySlug } from "../controllers/tripController.js";
import { Router } from "express";

const router = Router();

router.get("/", getAllTrips);
router.get("/:slug", getTripBySlug);

export default router;