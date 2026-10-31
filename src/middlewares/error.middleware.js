import { ApiError } from "../utils/api-error.js";
import mongoose from "mongoose";

export const errorHandler = (err, req, res, next) => {
    let error = err;

    if (!(error instanceof ApiError)) {
        const statusCode =
            error.statusCode || (error instanceof mongoose.Error ? 400 : 500);
        const message = error.message || "Internal Server Error";
        error = new ApiError(
            statusCode,
            message,
            error?.errors || [],
            err.stack
        );
    }

    const requestId = req.requestId || "unknown";
    const isProduction = process.env.NODE_ENV === "production";
    const isServerError = error.statusCode >= 500;

    if (isServerError) {
        const route = req.route?.path;
        const rawCode = err?.code;
        const errorCode = typeof rawCode === "number"
            ? rawCode
            : (typeof rawCode === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(rawCode) ? rawCode : undefined);
        console.error("Safar request failed", JSON.stringify({
            requestId,
            method: typeof req.method === "string" ? req.method.slice(0, 12) : "unknown",
            route: typeof route === "string" ? route.slice(0, 120) : "unmatched",
            statusCode: error.statusCode,
            errorName: typeof err?.name === "string" ? err.name.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 60) : "Error",
            ...(errorCode !== undefined ? { errorCode } : {}),
        }));
    }

    const response = {
        statusCode: error.statusCode,
        data: null,
        message: isProduction && isServerError ? "Internal Server Error" : error.message,
        success: false,
        errors: isProduction && isServerError ? [] : error.errors,
        requestId,
        ...(error.code ? { code: error.code } : {}),
        ...(process.env.NODE_ENV === "development" ? { stack: error.stack } : {})
    };

    return res.status(error.statusCode).json(response);
};
