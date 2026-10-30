
import { Router } from "express";

import {
    login,
    logoutUser,
    logoutAllSessions,
    registerUser,
    getCurrentUser,
    verifyEmail,
    resendVerificationEmail,
    refreshAccessToken,
    resetPassword,
    forgotPassword
} from "../controllers/authController.js";
import { healthCheck } from "../controllers/healthCheckController.js";

import { validate } from "../middlewares/validator.middleware.js";

import { verifyJWT } from "../middlewares/auth.middleware.js";
import { authLimiter } from "../middlewares/ratelimiter.middleware.js";
import { verifySameOrigin } from "../middlewares/csrf.middleware.js";

import {
    loginValidator,
    userRegisterValidator,
    forgotPasswordValidator,
    resetPasswordValidator,
} from "../validators/index.js";

const router = Router();

// Public routes
router.get("/",healthCheck);
router.post(
    "/register",
    authLimiter,
    userRegisterValidator(),
    validate,
    registerUser
);
router.post(
    "/login",
    authLimiter,
    loginValidator(),
    validate,
    login
);
router.get("/verify-email/:token", verifyEmail);
router.post("/resend-verification", authLimiter, resendVerificationEmail);
router.post("/refresh-token", authLimiter, verifySameOrigin, refreshAccessToken);
router.post(
    "/forgot-password",
    authLimiter,
    forgotPasswordValidator(),
    validate,
    forgotPassword
);

router.post(
    "/reset-password/:token",
    authLimiter,
    resetPasswordValidator(),
    validate,
    resetPassword
);

// Protected routes
router.get("/current-user", verifyJWT, getCurrentUser);
router.post("/logout", verifySameOrigin, logoutUser);
router.post("/logout-all", verifyJWT, verifySameOrigin, logoutAllSessions);

export default router;
