import Razorpay from "razorpay";

const clients = new Map();

export function getRazorpayConfiguration() {
  const mode = String(process.env.RAZORPAY_MODE || "").trim().toLowerCase();
  if (mode !== "test" && mode !== "live") {
    throw new Error("RAZORPAY_MODE must be set to test or live");
  }

  const prefix = `RAZORPAY_${mode.toUpperCase()}`;
  return {
    mode,
    keyId: process.env[`${prefix}_KEY_ID`]?.trim() || "",
    keySecret: process.env[`${prefix}_KEY_SECRET`]?.trim() || "",
    webhookSecret: process.env[`${prefix}_WEBHOOK_SECRET`]?.trim() || "",
  };
}

export function isRazorpayApiConfigured() {
  try {
    const { keyId, keySecret } = getRazorpayConfiguration();
    return Boolean(keyId && keySecret);
  } catch {
    return false;
  }
}

export function getRazorpayClient() {
  const configuration = getRazorpayConfiguration();
  if (!configuration.keyId || !configuration.keySecret) {
    throw new Error(`Razorpay ${configuration.mode} API credentials are not configured`);
  }

  const cacheKey = `${configuration.mode}:${configuration.keyId}`;
  if (!clients.has(cacheKey)) {
    clients.set(cacheKey, new Razorpay({
      key_id: configuration.keyId,
      key_secret: configuration.keySecret,
    }));
  }
  return clients.get(cacheKey);
}

// Keep the existing controller import shape while resolving the active SDK
// client from configuration. Test/live therefore share the same code paths.
const razorpay = new Proxy({}, {
  get(_target, property) {
    return getRazorpayClient()[property];
  },
  set(_target, property, value) {
    getRazorpayClient()[property] = value;
    return true;
  },
});

export default razorpay;
