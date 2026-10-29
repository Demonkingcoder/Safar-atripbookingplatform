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

    const response = {
        statusCode: error.statusCode,
        data: null,
        message: error.message,
        success: false,
        errors: error.errors,
        ...(process.env.NODE_ENV === "development" ? { stack: error.stack } : {})
    };

    return res.status(error.statusCode).json(response);
};
