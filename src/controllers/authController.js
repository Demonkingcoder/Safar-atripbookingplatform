
import User from "../models/User.js";
import RefreshSession from "../models/RefreshSession.js";
import mongoose from "mongoose";
import crypto from "crypto";
import jwt from "jsonwebtoken";

import {
    sendEmail,
    safeEmailErrorDetails,
    emailVerificationMailgenContent,
    forgotPasswordMailgenContent,
} from "../utils/mail.js";


import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { cookieClearOptions, cookieOptions, tokenLifetimes, verifyTokenClaims } from "../utils/token-policy.js";

const hashRefreshToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
const CONCURRENT_REFRESH_GRACE_MS = 5_000;

function verifySignedToken(token, secret, tokenType, ignoreExpiration = false) {
    if (!secret) throw new ApiError(500, "Authentication token secret is not configured");
    try {
        const decoded = jwt.verify(token, secret, ignoreExpiration ? { ignoreExpiration: true } : undefined);
        return verifyTokenClaims(decoded, tokenType);
    } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(401, tokenType === "refresh" ? "Invalid or expired refresh token" : "Invalid or expired access token");
    }
}

function refreshExpiry(now, absoluteExpiresAt) {
    return new Date(Math.min(
        now.getTime() + tokenLifetimes.refreshSeconds * 1000,
        now.getTime() + tokenLifetimes.inactivitySeconds * 1000,
        absoluteExpiresAt.getTime()
    ));
}

async function createRefreshSession(user, { absoluteExpiresAt, previousTokenHashes = [] } = {}) {
    const now = new Date();
    const sessionId = new mongoose.Types.ObjectId();
    const familyId = crypto.randomUUID();
    const absoluteExpiry = absoluteExpiresAt || new Date(now.getTime() + tokenLifetimes.absoluteSeconds * 1000);
    const expiresAt = refreshExpiry(now, absoluteExpiry);
    const refreshToken = user.generateRefreshToken({ sid: String(sessionId), fid: familyId, jti: crypto.randomUUID() }, Math.max(1, Math.floor((expiresAt - now) / 1000)));
    const accessToken = user.generateAccessToken({ sid: String(sessionId), fid: familyId });

    await RefreshSession.create({
        _id: sessionId,
        user: user._id,
        familyId,
        tokenHash: hashRefreshToken(refreshToken),
        previousTokenHashes,
        lastActivityAt: now,
        expiresAt,
        absoluteExpiresAt: absoluteExpiry,
    });
    return { accessToken, refreshToken, refreshMaxAge: Math.max(0, expiresAt - now) };
}

function setSessionCookies(res, tokens) {
    return res
        .cookie("accessToken", tokens.accessToken, cookieOptions(tokenLifetimes.accessSeconds * 1000))
        .cookie("refreshToken", tokens.refreshToken, cookieOptions(tokens.refreshMaxAge));
}

async function issueConcurrentRefreshGrace(session, incomingHash, res, now = new Date()) {
    const rotatedAt = session?.lastRotatedAt ? new Date(session.lastRotatedAt) : null;
    const age = rotatedAt ? now.getTime() - rotatedAt.getTime() : Number.POSITIVE_INFINITY;
    if (!session || session.revokedAt || session.lastRotatedFromHash !== incomingHash
        || age < 0 || age > CONCURRENT_REFRESH_GRACE_MS
        || session.expiresAt <= now || session.absoluteExpiresAt <= now) return null;

    const user = await User.findById(session.user);
    if (!user) throw new ApiError(401, "User not found or refresh token is invalid");
    if (!user.isActive) {
        await revokeRefreshFamily(session, "account-disabled");
        throw new ApiError(403, "Your account is disabled");
    }
    if (!user.isEmailVerified) {
        await revokeRefreshFamily(session, "email-unverified");
        throw new ApiError(403, "Please verify your email before continuing");
    }

    // The winning request already rotated the HttpOnly refresh cookie. Return only a
    // fresh access cookie here so the losing concurrent response cannot overwrite it.
    return res.status(200)
        .cookie("accessToken", user.generateAccessToken({ sid: String(session._id), fid: session.familyId }), cookieOptions(tokenLifetimes.accessSeconds * 1000))
        .json(new ApiResponse(200, {}, "Access token refreshed successfully"));
}

async function revokeRefreshFamily(session, reason, now = new Date()) {
    if (!session) return;
    await RefreshSession.updateMany(
        { familyId: session.familyId, revokedAt: null },
        { $set: { revokedAt: now, revocationReason: reason } }
    );
}

async function rotateLegacyRefreshToken(incomingToken, decodedToken) {
    const oldHash = hashRefreshToken(incomingToken);
    const user = await User.findOne({ _id: decodedToken._id, refreshToken: incomingToken });
    if (!user) {
        const reusedSession = await RefreshSession.findOne({ previousTokenHashes: oldHash });
        if (reusedSession) {
            await revokeRefreshFamily(reusedSession, "refresh-token-reuse");
            throw new ApiError(401, "Refresh token reuse detected; the session was revoked");
        }
        throw new ApiError(401, "Refresh token is invalid or revoked");
    }
    if (!user.isActive) throw new ApiError(403, "Your account is disabled");
    if (!user.isEmailVerified) throw new ApiError(403, "Please verify your email before continuing");

    const tokenExpiry = new Date(decodedToken.exp * 1000);
    const maximumExpiry = new Date(Date.now() + tokenLifetimes.absoluteSeconds * 1000);
    const absoluteExpiresAt = new Date(Math.min(tokenExpiry.getTime(), maximumExpiry.getTime()));
    if (absoluteExpiresAt <= new Date()) throw new ApiError(401, "Refresh token has expired");

    const tokens = await createRefreshSession(user, { absoluteExpiresAt, previousTokenHashes: [oldHash] });
    const revokedLegacy = await User.updateOne(
        { _id: user._id, refreshToken: incomingToken },
        { $set: { refreshToken: null } }
    );
    if (revokedLegacy.modifiedCount !== 1) {
        const created = await RefreshSession.findOne({ tokenHash: hashRefreshToken(tokens.refreshToken) });
        if (created) await revokeRefreshFamily(created, "legacy-token-reuse");
        const reused = await RefreshSession.findOne({ previousTokenHashes: oldHash });
        if (reused) await revokeRefreshFamily(reused, "legacy-token-reuse");
        throw new ApiError(401, "Refresh token reuse detected; the session was revoked");
    }
    return { user, tokens };
}
// Generate email verification token
const generateEmailVerificationToken = () => {
    const verificationToken = crypto.randomBytes(32).toString("hex");

    const hashedToken = crypto
        .createHash("sha256")
        .update(verificationToken)
        .digest("hex");

    return {
        verificationToken,
        hashedToken,
        expiry: new Date(Date.now() + 30 * 60 * 1000),
    };
};

// Send verification email
const sendVerificationEmail = async (user, verificationToken) => {
    const frontendUrl = (
        process.env.FRONTEND_URL || "http://localhost:5173"
    ).replace(/\/$/, "");

    const verificationUrl =
        `${frontendUrl}/verify-email/${verificationToken}`;

    await sendEmail({
        email: user.email,
        subject: "Verify your Bhupee email",
        mailgenContent: emailVerificationMailgenContent(
            user.fullName,
            verificationUrl
        ),
    });
};

function logEmailFailure(event, error, req) {
    const requestId = typeof req?.requestId === "string" ? req.requestId : undefined;
    console.error(`Safar ${event} failed`, JSON.stringify({
        ...(requestId ? { requestId } : {}),
        ...safeEmailErrorDetails(error),
    }));
}

// Register user
export const registerUser = asyncHandler(async (req, res) => {
    const { email, mobile, password, fullName } = req.body || {};

    if (!email || !mobile || !password || !fullName) {
        throw new ApiError(
            400,
            "Full name, email, mobile and password are required"
        );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedMobile = mobile.trim();

    const existingUser = await User.findOne({
        $or: [
            { email: normalizedEmail },
            { mobile: normalizedMobile },
        ],
    });

    if (existingUser) {
        throw new ApiError(
            409,
            "User with this email or mobile already exists"
        );
    }

    const {
        verificationToken,
        hashedToken,
        expiry,
    } = generateEmailVerificationToken();

    const user = await User.create({
        email: normalizedEmail,
        mobile: normalizedMobile,
        password,
        fullName: fullName.trim(),
        isEmailVerified: false,
        emailVerificationToken: hashedToken,
        emailVerificationExpiry: expiry,
    });

    try {
        await sendVerificationEmail(user, verificationToken);
    } catch (error) {
        logEmailFailure("verification email", error, req);

        // Keep the account so the user can request another email.
        throw new ApiError(
            503,
            "Account created, but the verification email could not be sent. Please request a new verification email."
        );
    }

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken -emailVerificationToken -emailVerificationExpiry"
    );

    return res.status(201).json(
        new ApiResponse(
            201,
            { user: createdUser },
            "Registration successful. Please check your email to verify your account."
        )
    );
});

// Login user
export const login = asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) throw new ApiError(400, "Email and password are required");

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user) throw new ApiError(401, "Invalid email or password");
    if (!user.isActive) throw new ApiError(403, "Your account is disabled");
    if (!(await user.isPasswordCorrect(password))) throw new ApiError(401, "Invalid email or password");
    if (!user.isEmailVerified) throw new ApiError(403, "Please verify your email before logging in");

    const tokens = await createRefreshSession(user);
    // Clear only the legacy per-user refresh token; other new per-device sessions remain active.
    await User.updateOne({ _id: user._id }, { $set: { refreshToken: null } });
    const loggedInUser = await User.findById(user._id).select(
        "-password -refreshToken -emailVerificationToken -emailVerificationExpiry"
    );

    return setSessionCookies(res.status(200), tokens).json(
        new ApiResponse(200, { user: loggedInUser }, "User logged in successfully")
    );
});

// Logout revokes the cookie-backed session even if its access token has expired.
export const logoutUser = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies?.refreshToken;
    let decoded = null;
    if (incomingRefreshToken) {
        try {
            decoded = verifySignedToken(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET, "refresh", true);
        } catch {
            // A malformed or forged cookie cannot identify a session; clear it below.
        }
    }

    if (decoded?.sid) {
        const session = await RefreshSession.findById(decoded.sid);
        if (session && String(session.user) === String(decoded._id)) await revokeRefreshFamily(session, "logout");
    } else if (decoded?._id && incomingRefreshToken) {
        await User.updateOne({ _id: decoded._id, refreshToken: incomingRefreshToken }, { $set: { refreshToken: null } });
    }

    return res.status(200)
        .clearCookie("accessToken", cookieClearOptions())
        .clearCookie("refreshToken", cookieClearOptions())
        .json(new ApiResponse(200, {}, "User logged out successfully"));
});
export const logoutAllSessions = asyncHandler(async (req, res) => {
    const now = new Date();
    await RefreshSession.updateMany(
        { user: req.user._id, revokedAt: null },
        { $set: { revokedAt: now, revocationReason: "logout-all" } }
    );
    await User.updateOne({ _id: req.user._id }, { $set: { refreshToken: null }, $inc: { authVersion: 1 } });
    return res.status(200)
        .clearCookie("accessToken", cookieClearOptions())
        .clearCookie("refreshToken", cookieClearOptions())
        .json(new ApiResponse(200, {}, "All sessions have been logged out"));
});
// Get current logged-in user
export const getCurrentUser = asyncHandler(async (req, res) => {
    return res.status(200).json(
        new ApiResponse(
            200,
            { user: req.user },
            "Current user fetched successfully"
        )
    );
});

// Verify email
export const verifyEmail = asyncHandler(async (req, res) => {
    const { token } = req.params;

    if (!token) {
        throw new ApiError(400, "Verification token is required");
    }

    const hashedToken = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

    const user = await User.findOne({
        emailVerificationToken: hashedToken,
        emailVerificationExpiry: { $gt: new Date() },
    });

    if (!user) {
        throw new ApiError(
            400,
            "Verification link is invalid or expired"
        );
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpiry = null;

    await user.save({ validateBeforeSave: false });

    return res.status(200).json(
        new ApiResponse(
            200,
            {},
            "Email verified successfully"
        )
    );
});

// Resend verification email
export const resendVerificationEmail = asyncHandler(async (req, res) => {
    const { email } = req.body || {};

    if (!email) {
        throw new ApiError(400, "Email is required");
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    // Use a generic response to avoid revealing registered accounts.
    const successMessage =
        "If the account exists and needs verification, a verification email will be sent.";

    if (!user || user.isEmailVerified) {
        return res.status(200).json(
            new ApiResponse(200, {}, successMessage)
        );
    }

    const {
        verificationToken,
        hashedToken,
        expiry,
    } = generateEmailVerificationToken();

    try {
        await sendVerificationEmail(user, verificationToken);
    } catch (error) {
        logEmailFailure("resend verification email", error, req);

        throw new ApiError(
            503,
            "Unable to send verification email right now. Please try again later."
        );
    }

    // Rotate the persisted token only after SMTP accepts the recipient. A failed
    // resend therefore leaves the previously stored verification link usable.
    user.emailVerificationToken = hashedToken;
    user.emailVerificationExpiry = expiry;
    await user.save({ validateBeforeSave: false });

    return res.status(200).json(
        new ApiResponse(200, {}, successMessage)
    );
});

// Refresh access token and rotate the hashed refresh token for this session.
export const refreshAccessToken = asyncHandler(async (req, res) => {
    try {
    const incomingRefreshToken = req.cookies?.refreshToken;
    if (!incomingRefreshToken) throw new ApiError(401, "Refresh token is required");

    const decodedToken = verifySignedToken(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET, "refresh");
    const incomingHash = hashRefreshToken(incomingRefreshToken);

    if (!decodedToken.token_use) {
        const migrated = await rotateLegacyRefreshToken(incomingRefreshToken, decodedToken);
        return setSessionCookies(res.status(200), migrated.tokens).json(
            new ApiResponse(200, {}, "Access token refreshed successfully")
        );
    }

    if (!decodedToken.sid || !decodedToken.fid || !decodedToken.jti) throw new ApiError(401, "Invalid refresh token");
    const session = await RefreshSession.findById(decodedToken.sid);
    if (!session || String(session.user) !== String(decodedToken._id) || session.familyId !== decodedToken.fid) {
        const reusedSession = await RefreshSession.findOne({ previousTokenHashes: incomingHash });
        if (reusedSession) await revokeRefreshFamily(reusedSession, "refresh-token-reuse");
        throw new ApiError(401, reusedSession ? "Refresh token reuse detected; the session was revoked" : "Refresh token is invalid or revoked");
    }

    if (session.revokedAt) throw new ApiError(401, "Refresh token is invalid or revoked");
    if (session.tokenHash !== incomingHash) {
        if (session.previousTokenHashes.includes(incomingHash)) {
            const graceResponse = await issueConcurrentRefreshGrace(session, incomingHash, res);
            if (graceResponse) return graceResponse;
            await revokeRefreshFamily(session, "refresh-token-reuse");
            throw new ApiError(401, "Refresh token reuse detected; the session was revoked");
        }
        throw new ApiError(401, "Refresh token is invalid or revoked");
    }

    const now = new Date();
    if (session.expiresAt <= now || session.absoluteExpiresAt <= now) {
        await revokeRefreshFamily(session, "expired");
        throw new ApiError(401, "Refresh session has expired");
    }

    const user = await User.findById(decodedToken._id);
    if (!user) throw new ApiError(401, "User not found or refresh token is invalid");
    if (!user.isActive) {
        await revokeRefreshFamily(session, "account-disabled");
        throw new ApiError(403, "Your account is disabled");
    }
    if (!user.isEmailVerified) {
        await revokeRefreshFamily(session, "email-unverified");
        throw new ApiError(403, "Please verify your email before continuing");
    }

    const nextExpiry = refreshExpiry(now, session.absoluteExpiresAt);
    const nextRefreshToken = user.generateRefreshToken(
        { sid: String(session._id), fid: session.familyId, jti: crypto.randomUUID() },
        Math.max(1, Math.floor((nextExpiry - now) / 1000))
    );
    const accessToken = user.generateAccessToken({ sid: String(session._id), fid: session.familyId });
    const nextHash = hashRefreshToken(nextRefreshToken);
    const rotated = await RefreshSession.findOneAndUpdate(
        { _id: session._id, tokenHash: incomingHash, revokedAt: null, expiresAt: { $gt: now }, absoluteExpiresAt: { $gt: now } },
        { $set: { tokenHash: nextHash, expiresAt: nextExpiry, lastActivityAt: now, lastRotatedFromHash: incomingHash, lastRotatedAt: now }, $push: { previousTokenHashes: incomingHash } },
        { new: true }
    );

    if (!rotated) {
        const latestSession = await RefreshSession.findById(session._id);
        if (latestSession && latestSession.previousTokenHashes.includes(incomingHash)) {
            const graceResponse = await issueConcurrentRefreshGrace(latestSession, incomingHash, res);
            if (graceResponse) return graceResponse;
            await revokeRefreshFamily(latestSession, "refresh-token-reuse");
            throw new ApiError(401, "Refresh token reuse detected; the session was revoked");
        }
        throw new ApiError(401, "Refresh token is invalid or expired");
    }

    return setSessionCookies(res.status(200), {
        accessToken,
        refreshToken: nextRefreshToken,
        refreshMaxAge: Math.max(0, nextExpiry - now),
    }).json(new ApiResponse(200, {}, "Access token refreshed successfully"));
    } catch (error) {
        if (error instanceof ApiError && (error.statusCode === 401 || error.statusCode === 403)) {
            res.clearCookie("accessToken", cookieClearOptions());
            res.clearCookie("refreshToken", cookieClearOptions());
        }
        throw error;
    }
});
export const forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body || {};
    if (!email || typeof email !== "string") throw new ApiError(400, "A valid email is required");

    const normalizedEmail = email.trim().toLowerCase();
    const genericMessage = "If an account exists for that email, a password-reset link will be sent.";
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(200).json(new ApiResponse(200, {}, genericMessage));

    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");
    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpiry = new Date(Date.now() + 15 * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
    const passwordResetUrl = frontendUrl + "/reset-password/" + encodeURIComponent(resetToken);
    try {
        await sendEmail({
            email: user.email,
            subject: "Reset your Safar password",
            mailgenContent: forgotPasswordMailgenContent(user.fullName, passwordResetUrl),
        });
    } catch {
        await User.updateOne(
            { _id: user._id, resetPasswordToken: hashedToken },
            { $set: { resetPasswordToken: null, resetPasswordExpiry: null } }
        );
        // Keep the response identical for unknown users and mail failures.
    }

    return res.status(200).json(new ApiResponse(200, {}, genericMessage));
});
export const resetPassword = asyncHandler(async (req, res) => {
    const { token } = req.params;
    const { password } = req.body || {};
    if (typeof token !== "string" || token.length < 32) throw new ApiError(400, "Reset link is invalid or expired");
    if (typeof password !== "string" || password.length < 8) throw new ApiError(400, "Password must be at least 8 characters long");

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    // Atomically consume the token so two simultaneous submissions cannot both succeed.
    const user = await User.findOneAndUpdate(
        { resetPasswordToken: hashedToken, resetPasswordExpiry: { $gt: new Date() } },
        { $set: { resetPasswordToken: null, resetPasswordExpiry: null, refreshToken: null } },
        { new: true }
    );
    if (!user) throw new ApiError(400, "Reset link is invalid, expired, or already used");

    await RefreshSession.updateMany(
        { user: user._id, revokedAt: null },
        { $set: { revokedAt: new Date(), revocationReason: "password-reset" } }
    );
    user.authVersion = (user.authVersion || 0) + 1;
    user.password = password;
    await user.save();

    return res.status(200)
        .clearCookie("accessToken", cookieClearOptions())
        .clearCookie("refreshToken", cookieClearOptions())
        .json(new ApiResponse(200, {}, "Password reset successfully. Please log in again."));
});
