import { Router } from "express";
import { healthCheck, workerHealthCheck } from "../controllers/healthCheckController.js";

const router = Router();

router.route("/").get(healthCheck);
router.route("/worker").get(workerHealthCheck);

export default router;
