import { ApiError } from "./api-error.js";

function parseSeconds(value, fallback, maximum) {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  const match = String(value).trim().match(/^([0-9]+(?:\.[0-9]+)?)\s*(s|sec|m|min|h|d|w|y)?$/i);
  if (!match) throw new Error("Invalid token lifetime configuration");
  const amount = Number(match[1]);
  const unit = (match[2] || "s").toLowerCase();
  const multiplier = unit.startsWith("s") ? 1 : unit.startsWith("m") ? 60 : unit === "h" ? 3600 : unit === "d" ? 86400 : unit === "w" ? 604800 : 31536000;
  return Math.max(1, Math.min(Math.floor(amount * multiplier), maximum));
}

const MAX_REFRESH_SECONDS = 7 * 24 * 60 * 60;
export const tokenLifetimes = Object.freeze({
  accessSeconds: parseSeconds(process.env.ACCESS_TOKEN_EXPIRY, 15 * 60, 15 * 60),
  refreshSeconds: Math.min(
    parseSeconds(process.env.REFRESH_TOKEN_EXPIRY, MAX_REFRESH_SECONDS, MAX_REFRESH_SECONDS),
    parseSeconds(process.env.REFRESH_TOKEN_INACTIVITY_EXPIRY, MAX_REFRESH_SECONDS, MAX_REFRESH_SECONDS),
    parseSeconds(process.env.REFRESH_SESSION_ABSOLUTE_EXPIRY, MAX_REFRESH_SECONDS, MAX_REFRESH_SECONDS),
  ),
  inactivitySeconds: parseSeconds(process.env.REFRESH_TOKEN_INACTIVITY_EXPIRY, MAX_REFRESH_SECONDS, MAX_REFRESH_SECONDS),
  absoluteSeconds: parseSeconds(process.env.REFRESH_SESSION_ABSOLUTE_EXPIRY, MAX_REFRESH_SECONDS, MAX_REFRESH_SECONDS),
});

export function tokenSigningOptions(tokenType, expiresIn) {
  return {
    expiresIn,
    ...(process.env.JWT_ISSUER ? { issuer: process.env.JWT_ISSUER } : {}),
    ...(process.env.JWT_AUDIENCE ? { audience: process.env.JWT_AUDIENCE } : {}),
  };
}

export function verifyTokenClaims(decoded, tokenType) {
  if (!decoded || typeof decoded !== "object" || !decoded._id || !Number.isFinite(decoded.iat) || !Number.isFinite(decoded.exp)) {
    throw new ApiError(401, "Invalid authentication token");
  }
  // Existing signed tokens did not include token_use/iss/aud. Continue to honor them
  // until they expire; enforce the configured claims on all newly issued tokens.
  if (decoded.token_use !== undefined) {
    if (decoded.token_use !== tokenType) throw new ApiError(401, "Invalid authentication token");
    if (process.env.JWT_ISSUER && decoded.iss !== process.env.JWT_ISSUER) throw new ApiError(401, "Invalid authentication token");
    if (process.env.JWT_AUDIENCE) {
      const audiences = Array.isArray(decoded.aud) ? decoded.aud : [decoded.aud];
      if (!audiences.includes(process.env.JWT_AUDIENCE)) throw new ApiError(401, "Invalid authentication token");
    }
  }
  return decoded;
}

function getSameSite() {
  const value = (process.env.COOKIE_SAME_SITE || "lax").toLowerCase();
  return ["strict", "lax", "none"].includes(value) ? value : "lax";
}

export function cookieOptions(maxAge) {
  const sameSite = getSameSite();
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" || sameSite === "none",
    sameSite,
    path: "/",
    ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
    ...(Number.isFinite(maxAge) ? { maxAge } : {}),
  };
}

export function cookieClearOptions() {
  const { maxAge, ...options } = cookieOptions();
  return options;
}

export function trustedOrigins() {
  const configured = (process.env.CORS_ORIGIN || process.env.CORS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin && origin !== "*");
  if (!configured.length) configured.push(process.env.FRONTEND_URL || "http://localhost:5173");
  return configured.map((origin) => {
    try { return new URL(origin).origin; } catch { return origin.replace(/\/$/, ""); }
  });
}

export function verifySameOrigin(req, res, next) {
  const origin = req.get("origin");
  const fetchSite = req.get("sec-fetch-site");
  if ((origin && !trustedOrigins().includes(origin)) || (!origin && fetchSite === "cross-site")) {
    return next(new ApiError(403, "Cross-origin authentication request rejected"));
  }
  return next();
}
