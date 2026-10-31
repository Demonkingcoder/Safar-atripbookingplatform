import mongoose from "mongoose";

const refreshSessionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  familyId: { type: String, required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  previousTokenHashes: { type: [String], default: [] },
  lastRotatedFromHash: { type: String, default: null },
  lastRotatedAt: { type: Date, default: null },
  lastActivityAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true, index: true },
  absoluteExpiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
  revocationReason: { type: String, default: null },
}, { timestamps: true });

refreshSessionSchema.index({ familyId: 1, revokedAt: 1 });
refreshSessionSchema.index({ previousTokenHashes: 1 });

const RefreshSession = mongoose.model("RefreshSession", refreshSessionSchema);
export default RefreshSession;
