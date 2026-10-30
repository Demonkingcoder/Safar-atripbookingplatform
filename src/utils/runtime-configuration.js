
const LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
]);

function normalizeHostname(hostname) {
  return hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/^\./, "");
}

function isLocalHost(hostname) {
  const normalized = normalizeHostname(hostname);

  return (
    LOCAL_HOSTS.has(normalized) ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local")
  );
}

function required(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function publicHttpsOrigin(name, value) {
  let url;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a public HTTPS origin`);
  }

  if (
    url.protocol !== "https:" ||
    isLocalHost(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      `${name} must be a public HTTPS origin without a path`
    );
  }

  return url.origin;
}

function belongsToSite(hostname, siteDomain) {
  const host = normalizeHostname(hostname);
  const domain = normalizeHostname(siteDomain);

  return host === domain || host.endsWith(`.${domain}`);
}

function validateMongoUri() {
  const value = required("MONGO_URI");

  let url;

  try {
    url = new URL(value);
  } catch {
    throw new Error(
      "MONGO_URI must be a valid MongoDB connection URI"
    );
  }

  if (
    !["mongodb:", "mongodb+srv:"].includes(url.protocol) ||
    isLocalHost(url.hostname)
  ) {
    throw new Error(
      "MONGO_URI must not point to a local development database in production"
    );
  }
}

function validateCookieConfiguration(frontendOrigin, apiOrigin) {
  const sameSite = String(
    process.env.COOKIE_SAME_SITE || "lax"
  )
    .trim()
    .toLowerCase();

  if (!["lax", "none"].includes(sameSite)) {
    throw new Error("COOKIE_SAME_SITE must be lax or none");
  }

  const siteDomain = String(
    process.env.COOKIE_SITE_DOMAIN || ""
  )
    .trim()
    .toLowerCase()
    .replace(/^\./, "");

  // SameSite=None supports separate Vercel and Render domains.
  // Production HTTPS is already enforced by publicHttpsOrigin().
  if (sameSite === "none") {
    if (process.env.COOKIE_DOMAIN?.trim()) {
      throw new Error(
        "Leave COOKIE_DOMAIN unset when COOKIE_SAME_SITE=none; use host-only cookies"
      );
    }

    return sameSite;
  }

  // SameSite=Lax requires frontend and API to share a site.
  if (
    !siteDomain ||
    !/^(?=.{1,253}$)[a-z0-9.-]+$/.test(siteDomain) ||
    siteDomain.includes("..") ||
    siteDomain.startsWith(".") ||
    siteDomain.endsWith(".")
  ) {
    throw new Error(
      "COOKIE_SITE_DOMAIN is required and must be valid when COOKIE_SAME_SITE=lax"
    );
  }

  const frontendHost = new URL(frontendOrigin).hostname;
  const apiHost = new URL(apiOrigin).hostname;

  if (
    ![frontendHost, apiHost].every((hostname) =>
      belongsToSite(hostname, siteDomain)
    )
  ) {
    throw new Error(
      "FRONTEND_URL and API_PUBLIC_URL must use COOKIE_SITE_DOMAIN or one of its subdomains when COOKIE_SAME_SITE=lax"
    );
  }

  if (process.env.COOKIE_DOMAIN?.trim()) {
    const cookieDomain = process.env.COOKIE_DOMAIN
      .trim()
      .toLowerCase()
      .replace(/^\./, "");

    if (cookieDomain !== siteDomain) {
      throw new Error(
        "COOKIE_DOMAIN must match COOKIE_SITE_DOMAIN"
      );
    }
  }

  return sameSite;
}

function validateCors(frontendOrigin, sameSite, siteDomain) {
  const origins = required("CORS_ORIGIN")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (
    origins.length === 0 ||
    origins.some((origin) => origin === "*")
  ) {
    throw new Error(
      "CORS_ORIGIN must list exact public frontend origins"
    );
  }

  const allowedOrigins = origins.map((origin, index) =>
    publicHttpsOrigin(`CORS_ORIGIN entry ${index + 1}`, origin)
  );

  if (!allowedOrigins.includes(frontendOrigin)) {
    throw new Error(
      "CORS_ORIGIN must include the FRONTEND_URL origin"
    );
  }

  if (
    sameSite === "lax" &&
    allowedOrigins.some(
      (origin) =>
        !belongsToSite(new URL(origin).hostname, siteDomain)
    )
  ) {
    throw new Error(
      "Every CORS_ORIGIN must use COOKIE_SITE_DOMAIN or one of its subdomains"
    );
  }

  return allowedOrigins;
}

function validateEmailConfiguration() {
  for (const name of [
    "BREVO_SMTP_HOST",
    "BREVO_SMTP_USER",
    "BREVO_SMTP_PASS",
    "BREVO_SENDER_EMAIL",
  ]) {
    required(name);
  }

  const smtpPort = Number(required("BREVO_SMTP_PORT"));

  if (
    !Number.isInteger(smtpPort) ||
    smtpPort < 1 ||
    smtpPort > 65535
  ) {
    throw new Error(
      "BREVO_SMTP_PORT must be a valid TCP port"
    );
  }
}

function validateRazorpayConfiguration() {
  const mode = String(process.env.RAZORPAY_MODE || "")
    .trim()
    .toLowerCase();

  if (!["test", "live"].includes(mode)) {
    throw new Error("RAZORPAY_MODE must be test or live");
  }

  const prefix = `RAZORPAY_${mode.toUpperCase()}`;

  for (const suffix of [
    "KEY_ID",
    "KEY_SECRET",
    "WEBHOOK_SECRET",
  ]) {
    required(`${prefix}_${suffix}`);
  }
}

export function validateRuntimeConfiguration(service) {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  if (service !== "api" && service !== "worker") {
    throw new Error("Runtime service must be api or worker");
  }

  validateMongoUri();

  const frontendOrigin = publicHttpsOrigin(
    "FRONTEND_URL",
    required("FRONTEND_URL")
  );

  validateEmailConfiguration();

  // The worker does not need API URL, cookie or payment configuration.
  if (service === "worker") {
    return true;
  }

  const apiOrigin = publicHttpsOrigin(
    "API_PUBLIC_URL",
    required("API_PUBLIC_URL")
  );

  if (process.env.RUN_NOTIFICATION_WORKER !== "false") {
    throw new Error(
      'RUN_NOTIFICATION_WORKER must be exactly "false" on the API service when using a dedicated worker'
    );
  }

  required("ACCESS_TOKEN_SECRET");
  required("REFRESH_TOKEN_SECRET");

  const sameSite = validateCookieConfiguration(
    frontendOrigin,
    apiOrigin
  );

  const siteDomain = String(
    process.env.COOKIE_SITE_DOMAIN || ""
  )
    .trim()
    .toLowerCase()
    .replace(/^\./, "");

  validateCors(frontendOrigin, sameSite, siteDomain);

  validateRazorpayConfiguration();

  return true;
}
