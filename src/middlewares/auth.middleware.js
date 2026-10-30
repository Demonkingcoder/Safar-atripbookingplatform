import jwt from "jsonwebtoken";
import RefreshSession from "../models/RefreshSession.js";
import  User  from "../models/User.js";
import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { verifyTokenClaims } from "../utils/token-policy.js";

export const verifyJWT = asyncHandler(async (req, res, next) => {
    const token =
        req.cookies?.accessToken ||
        req.header("Authorization")?.replace(/^Bearer\s+/i, "");

    if (!token) {
        throw new ApiError(401, "Unauthorized request");
    }

    const secret = process.env.ACCESS_TOKEN_SECRET;

    if (!secret) {
        throw new ApiError(500, "Access token secret is not configured");
    }

    let decodedToken;

    try {
        decodedToken = verifyTokenClaims(jwt.verify(token, secret), "access");
    } catch {
        throw new ApiError(401, "Invalid or expired access token");
    }

    if (
        typeof decodedToken === "string" ||
        !decodedToken._id
    ) {
        throw new ApiError(401, "Invalid access token");
    }

    const user = await User.findById(decodedToken._id).select(
        "-password -refreshToken -emailVerificationToken -emailVerificationExpiry"
    );

    if (!user) {
        throw new ApiError(401, "User not found or access token is invalid");
    }

    if (decodedToken.token_use === "access") {
        if (decodedToken.authVersion !== (user.authVersion || 0) || !decodedToken.sid || !decodedToken.fid) {
            throw new ApiError(401, "Access token session is invalid or revoked");
        }
        const session = await RefreshSession.findById(decodedToken.sid);
        const now = new Date();
        if (!session || String(session.user) !== String(user._id) || session.familyId !== decodedToken.fid
            || session.revokedAt || session.expiresAt <= now || session.absoluteExpiresAt <= now) {
            throw new ApiError(401, "Access token session is invalid or revoked");
        }
    }

    req.user = user;
    next();
});
