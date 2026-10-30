import { ApiError } from "../utils/api-error.js";

export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return next(new ApiError(403, "Administrator access is required"));
  return next();
}
