
import User from "../models/User.js";
import crypto from "crypto";
import jwt from "jsonwebtoken";

import {
    sendEmail,
    emailVerificationMailgenContent,
    forgotPasswordMailgenContent,
} from "../utils/mail.js";


import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
};

// Generate access and refresh tokens
const generateAccessandRefreshTokens = async (userId) => {
    const user = await User.findById(userId);

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
};

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
        console.error("Verification email failed:", error.message);

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

    if (!email || !password) {
        throw new ApiError(400, "Email and password are required");
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
        throw new ApiError(401, "Invalid email or password");
    }

    if (!user.isActive) {
        throw new ApiError(403, "Your account is disabled");
    }

    if (!user.isEmailVerified) {
    throw new ApiError(
        403,
        "Please verify your email before logging in"
    );
}

    const isPasswordValid = await user.isPasswordCorrect(password);

    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid email or password");
    }

    // Email verification is not enforced at login yet.
    const { accessToken, refreshToken } =
        await generateAccessandRefreshTokens(user._id);

    const loggedInUser = await User.findById(user._id).select(
        "-password -refreshToken -emailVerificationToken -emailVerificationExpiry"
    );

    return res
        .status(200)
        .cookie("accessToken", accessToken, cookieOptions)
        .cookie("refreshToken", refreshToken, cookieOptions)
        .json(
            new ApiResponse(
                200,
                { user: loggedInUser },
                "User logged in successfully"
            )
        );
});

// Logout user
export const logoutUser = asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(req.user._id, {
        $set: { refreshToken: null },
    });

    return res
        .status(200)
        .clearCookie("accessToken", cookieOptions)
        .clearCookie("refreshToken", cookieOptions)
        .json(
            new ApiResponse(200, {}, "User logged out successfully")
        );
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

    user.emailVerificationToken = hashedToken;
    user.emailVerificationExpiry = expiry;

    await user.save({ validateBeforeSave: false });

    try {
        await sendVerificationEmail(user, verificationToken);
    } catch (error) {
        console.error("Resend verification failed:", error.message);

        throw new ApiError(
            503,
            "Unable to send verification email right now. Please try again later."
        );
    }

    return res.status(200).json(
        new ApiResponse(200, {}, successMessage)
    );
});

// Refresh access token
export const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies?.refreshToken;

    if (!incomingRefreshToken) {
        throw new ApiError(401, "Refresh token is required");
    }

    let decodedToken;

    try {
        const secret = process.env.REFRESH_TOKEN_SECRET;

        if (!secret) {
            throw new Error("Refresh token secret is not configured");
        }

        decodedToken = jwt.verify(incomingRefreshToken, secret);
    } catch {
        throw new ApiError(401, "Invalid or expired refresh token");
    }

    if (typeof decodedToken === "string" || !decodedToken._id) {
        throw new ApiError(401, "Invalid refresh token");
    }

    const user = await User.findById(decodedToken._id);

    if (!user || user.refreshToken !== incomingRefreshToken) {
        throw new ApiError(401, "Refresh token is invalid or revoked");
    }

    if (!user.isActive) {
        throw new ApiError(403, "Your account is disabled");
    }

    const { accessToken, refreshToken } =
        await generateAccessandRefreshTokens(user._id);

    return res
        .status(200)
        .cookie("accessToken", accessToken, cookieOptions)
        .cookie("refreshToken", refreshToken, cookieOptions)
        .json(
            new ApiResponse(
                200,
                {},
                "Access token refreshed successfully"
            )
        );
});

export const forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body || {};

    if (!email || typeof email !== "string") {
        throw new ApiError(400, "A valid email is required");
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    // Don't reveal whether an account exists.
    const message =
        "If an account exists for that email, a password-reset link will be sent.";

    if (!user) {
        return res.status(200).json(
            new ApiResponse(200, {}, message)
        );
    }

    const resetToken = crypto.randomBytes(32).toString("hex");

    const hashedToken = crypto
        .createHash("sha256")
        .update(resetToken)
        .digest("hex");

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpiry = new Date(Date.now() + 20 * 60 * 1000);

    await user.save({ validateBeforeSave: false });

    const frontendUrl = (
        process.env.FRONTEND_URL || "http://localhost:5173"
    ).replace(/\/$/, "");

    const passwordResetUrl =
        `${frontendUrl}/reset-password/${resetToken}`;

    try {
        await sendEmail({
            email: user.email,
            subject: "Reset your Bhupee password",
            mailgenContent: forgotPasswordMailgenContent(
                user.fullName,
                passwordResetUrl
            ),
        });
    } catch (error) {
        user.resetPasswordToken = null;
        user.resetPasswordExpiry = null;
        await user.save({ validateBeforeSave: false });

        console.error("Password-reset email failed:", error.message);

        throw new ApiError(
            503,
            "Unable to send the reset email right now. Please try again later."
        );
    }

    return res.status(200).json(
        new ApiResponse(200, {}, message)
    );
});


export const resetPassword = asyncHandler(async (req, res) => {
    const { token } = req.params;
    const { password } = req.body || {};

    if (!token) {
        throw new ApiError(400, "Reset token is required");
    }

    if (
        typeof password !== "string" ||
        password.length < 8
    ) {
        throw new ApiError(
            400,
            "Password must be at least 8 characters long"
        );
    }

    const hashedToken = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

    const user = await User.findOne({
        resetPasswordToken: hashedToken,
        resetPasswordExpiry: { $gt: new Date() },
    });

    if (!user) {
        throw new ApiError(
            400,
            "Password-reset link is invalid or expired"
        );
    }

    // Assigning the password should trigger your existing bcrypt
    // pre-save hook, if your User model has one.
    user.password = password;

    // Consume the token so it cannot be reused.
    user.resetPasswordToken = null;
    user.resetPasswordExpiry = null;

    // Revoke the stored refresh token so old sessions cannot renew.
    user.refreshToken = null;

    await user.save();

    // Clear cookies if the browser has them.
    return res
        .status(200)
        .clearCookie("accessToken", cookieOptions)
        .clearCookie("refreshToken", cookieOptions)
        .json(
            new ApiResponse(
                200,
                {},
                "Password reset successfully. Please log in again."
            )
        );
});
