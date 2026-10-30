# Safar production deployment

## Hosting topology and commands

This repository is prepared as a monorepo with three Render services and one Vercel project:

| Service | Root directory | Build command | Start command / output |
| --- | --- | --- | --- |
| Render API web service | repository root | `npm ci` | `npm start` (`node src/bserver.js`) |
| Render notification background worker | repository root | `npm ci` | `npm run worker` (`node src/worker.js`) |
| Vercel React/Vite frontend | `frontend` | `npm run build` | `dist` |

`render.yaml` defines the API and worker. The API service sets `RUN_NOTIFICATION_WORKER=false`; local `npm start` keeps the worker enabled by default unless explicitly disabled. The dedicated worker connects to the same MongoDB outbox and is the only Render service processing notifications. The frontend config in `frontend/vercel.json` enables Vite builds and SPA route fallback. Set the Vercel project Root Directory to `frontend`.

Use Node.js 22.12 or newer within Node 22, as pinned by `.node-version` and each package's `engines` field. Root `npm ci` installs backend dependencies; `frontend/npm ci` installs frontend dependencies. In Vercel, use `npm ci` as the install command, `npm run build`, and `dist` as the output directory.

Render currently offers Singapore as its closest listed region to India; the Blueprint places both Render services there. Atlas can place the database in AWS Mumbai (`ap-south-1`). This leaves the database on a different provider/region and adds network latency; measure API and booking latency before launch. Render's current regions are listed in its [regions documentation](https://render.com/docs/regions), and Atlas identifies `ap-south-1` as Mumbai in its [AWS region table](https://www.mongodb.com/docs/atlas/reference/amazon-aws/).

## Vercel frontend configuration

Set `VITE_API_BASE_URL` in Vercel for each environment. It must be the public API origin plus `/api/v1`, for example `https://api.your-domain.example/api/v1`. This is a public build-time URL, not a secret. `frontend/src/services/api.js` uses it directly and includes credentials for the existing HttpOnly-cookie session. Do not add Razorpay API secrets, webhook secrets, JWT secrets, or SMTP credentials to Vercel.

Use the Vercel Preview environment for staging and Production for the live site. Set each environment's `VITE_API_BASE_URL` to the matching Render API origin, then redeploy because Vite embeds this value at build time. Keep the existing Vite proxy for local development; it targets the local Express service on port 5000.

## Render API and worker configuration

Create the services from the repository's `render.yaml` Blueprint. It uses `npm ci`, `npm start`, and `npm run worker`; Render supplies `PORT` to the web service, so do not set a fixed production port. Set the exact frontend origin(s) in `CORS_ORIGIN` as comma-separated origins with no path or wildcard. Set `FRONTEND_URL` to the explicitly configured frontend origin, which may be a temporary HTTPS placeholder until Vercel is deployed, and set `API_PUBLIC_URL` to the public Render API origin. Do not invent a frontend URL. `COOKIE_SITE_DOMAIN` is needed only for same-site `COOKIE_SAME_SITE=lax`. The API uses credentialed CORS and the worker does not need a public URL.

Blueprint `sync: false` entries are placeholders for Render dashboard/initial Blueprint setup. Do not put values in `render.yaml` or Git. Configure secrets separately for staging and production; add new secrets manually to existing services when needed. The worker must receive the same `MONGO_URI`, `FRONTEND_URL`, and Brevo SMTP values as the API; only the API requires auth and Razorpay credentials.

For default `*.vercel.app` frontend and `*.onrender.com` API hosts, use `COOKIE_SAME_SITE=none`; production cookies are Secure and HttpOnly. The API validates HTTPS origins but does not require unrelated Vercel/Render domains to share a cookie-site suffix. Leave `COOKIE_DOMAIN` unset so cookies remain host-only on the API. CORS remains an exact allowlist with credentials enabled; `CORS_ORIGIN` must include `FRONTEND_URL` and must never contain `*`. For custom sibling subdomains, you may use `COOKIE_SAME_SITE=lax` if both URLs belong to the configured `COOKIE_SITE_DOMAIN`. The API rejects invalid cookie modes, mismatched Lax domains, missing origins, and localhost fallbacks.

### Backend-first Render rollout

1. **Deploy the backend first.** Create the Render API and worker services. Set the database, auth, active Razorpay, and Brevo values listed below. Set `API_PUBLIC_URL` to the Render API origin. Because the current mail and authentication flows generate frontend links, keep `FRONTEND_URL` and `CORS_ORIGIN` configured to the same explicit temporary HTTPS origin until Vercel exists; the origin need not resolve yet, but verification/reset links will not work until it does. Use `COOKIE_SAME_SITE=none` for the separate Render/Vercel default domains and leave `COOKIE_DOMAIN` unset. The API health route does not depend on the frontend being live.
2. **Deploy the frontend to Vercel.** Configure `VITE_API_BASE_URL` as the Render API origin plus `/api/v1`; the production build rejects a missing, local, or non-HTTPS value.
3. **Update Render origins.** Replace the temporary origin in `FRONTEND_URL` and `CORS_ORIGIN` with the deployed Vercel origin(s), exactly including scheme and host and without a path. Keep `COOKIE_SAME_SITE=none` for `*.vercel.app` + `*.onrender.com`. Restart/redeploy the API and worker so emailed links point to the deployed frontend. With custom same-site subdomains, set `COOKIE_SAME_SITE=lax` and `COOKIE_SITE_DOMAIN` to the shared parent domain instead.
4. **Verify end to end.** Test credentialed authentication and refresh cookies in the browser, registration/verification and password-reset links, trip browsing, a Razorpay Test payment and signed webhook, booking state, and notification delivery/retry. Do not infer payment verification from a checkout redirect.

## MongoDB Atlas in Mumbai

Create the Atlas cluster in AWS Mumbai, region `ap-south-1`. Use a transaction-capable replica-set deployment; choose a dedicated M10+ cluster at minimum, and size higher for production load (Atlas recommends M30+ for production workloads). Do not use a standalone MongoDB server. Configure a least-privilege database user, TLS, backups, and Atlas Network Access for the Render services' outbound IP ranges. Avoid opening Atlas to all IPs where possible.

Set the Atlas SRV connection string as `MONGO_URI` on both Render services. Keep the database name `safar` or update it consistently in the connection string; URL-encode special characters in the database password. On startup the backend checks `hello` for replica-set/sharded transaction capability and awaits required index creation before listening. Index creation failure stops startup. The API readiness endpoint returns `503` if MongoDB is disconnected or transactions are unavailable, so Render will not route traffic to an unsuitable database deployment.

## Health checks and worker monitoring

- Render API health check: `GET /api/v1/healthcheck` (configured in `render.yaml`). It returns `200` only when MongoDB is ready and transaction support is detected; otherwise it returns `503`.
- Notification worker probe: `GET /api/v1/healthcheck/worker`. The worker stores process liveness every 10 seconds and separately records pass/job progress and lease renewal. The endpoint returns `503` when the heartbeat is stale, MongoDB is unavailable, processing is stalled, or the worker is degraded. It reports dead-letter counts in the queue section without treating them as process liveness failures.
- Render background workers do not receive inbound HTTP traffic and Render monitors their process uptime/exit status. Configure an external uptime/alerting monitor to poll the API worker probe. Alert separately on `queue.deadLetterJobs`, stalled processing, and worker process availability; heartbeat alone does not prove that email delivery is progressing.

The startup index check ensures model indexes and explicit indexes for departure lookup, webhook idempotency, notification outbox claims, and worker heartbeat. Keep the Render MongoDB database user authorized to create indexes. For a controlled index rollout, run the read-only duplicate preflight below before switching production traffic.

## Staging rollout

1. Create a separate Atlas staging database/cluster in Mumbai and separate Render staging API/worker services. Do not point staging at production records.
2. Set Render staging secrets and non-secret values from `.env.example`; use separate JWT secrets, Brevo configuration, and Razorpay Test API/webhook credentials. Set `RAZORPAY_MODE=test`.
3. Create a Vercel Preview/staging deployment with its own `VITE_API_BASE_URL`. Set staging `FRONTEND_URL` and exact `CORS_ORIGIN` to the Preview alias/custom domain used by testers.
4. Configure the Razorpay Test webhook to `https://<staging-api-host>/api/v1/bookings/webhook` for `payment.captured`, `refund.processed`, and `refund.failed`.
5. Confirm API and worker probes are healthy, test registration/authentication, checkout, signed webhook confirmation, refund behavior, and delivery/retry of notification emails.

## Production rollout

1. Create a separate production Atlas database/cluster in Mumbai, production Render API and worker, and Vercel Production project/domain. Use custom same-site frontend/API domains where possible.
2. Set production `MONGO_URI`, authentication secrets, `FRONTEND_URL`, exact `CORS_ORIGIN`, cookie policy, Brevo SMTP values, and Razorpay credentials in provider secret managers. Never reuse staging secrets.
3. Start with `RAZORPAY_MODE=test`; verify API/worker readiness and indexes. Only configure `RAZORPAY_MODE=live` after adding all three Live Razorpay variables and a Live webhook as described below.
4. Set Vercel Production `VITE_API_BASE_URL` to `https://<production-api-host>/api/v1` and redeploy the frontend.
5. Run a controlled low-value Live payment, verify its signed webhook, booking state, customer email, and refund path. This is a manual launch gate; configuration and automated tests alone do not verify Live payment processing.
6. Monitor API health, worker heartbeat, dead-letter jobs, MongoDB/Render logs, Brevo delivery, and Razorpay webhook delivery. Keep a rollback path to the previous deployment and avoid pointing production at staging data.

These files prepare deployment configuration only. No Vercel, Render, Atlas, Brevo, or Razorpay resource is created or deployed by this change.

## MongoDB and indexes

Booking seat reservation and release updates span `Departure`, `Booking`, and the notification outbox. Deploy MongoDB as a replica set or sharded cluster with transactions enabled. A single-node replica set is sufficient for local development. A standalone MongoDB server is detected at startup; the API stays available, but multi-document booking, refund, and cancellation operations return `503` before changing inventory. The server does not fall back to a non-atomic reservation.

At backend startup the app explicitly calls `createIndexes()` for the `Booking`, `User`, `RefreshSession`, `Trip`, `Departure`, `PaymentWebhookEvent`, `NotificationOutbox`, and `NotificationWorkerHeartbeat` models. This ensures their schema indexes as well as notification/webhook claim and worker-heartbeat indexes. The new collections/fields are additive. No existing booking/user records are rewritten, and no destructive migration is required. Ensure the MongoDB application user has permission to create indexes during deployment; otherwise run the model `createIndexes()` calls once with a migration/deployment account. Preflight existing data for duplicate values before creating unique indexes.

Before deployment, run `npm run preflight:indexes` against the target database using `MONGO_URI`. This read-only command checks duplicate groups for every unique index (including partial booking idempotency/reference indexes), prints only index names and duplicate counts, and exits nonzero if conflicts exist. It does not create indexes or alter records. Resolve duplicates through an approved data-repair plan; this project will not delete or rewrite customer/booking data automatically. The preflight database user needs read/aggregate permissions on the affected collections. The API/worker deployment user needs `createIndex` privileges on the application database because startup awaits index creation. Run the preflight separately in staging and production before the first deployment and after relevant data imports.

Production startup validates required API/worker settings before connecting: HTTPS frontend/API origins, exact CORS entries, MongoDB host, Brevo SMTP settings, active Razorpay credentials (API only), and cookie-mode/domain compatibility. `FRONTEND_URL` remains required because verification/reset and notification emails create links; before Vercel deployment, set it and `CORS_ORIGIN` to the same explicit temporary HTTPS origin. The API requires `RUN_NOTIFICATION_WORKER=false` so it cannot start a second worker. The Vercel production build also fails unless `VITE_API_BASE_URL` is a public HTTPS URL ending exactly in `/api/v1`; configure this in Preview and Production separately. These checks prevent silent localhost/default API fallbacks. SMTP connection, greeting, and socket timeouts are bounded by the mail transport.

## Razorpay

The same Razorpay client adapter, booking controllers, authentication, payment-order creation, payment signature validation, webhook processing, and refund implementation are used in Test and Live modes. No payment code path branches on the mode beyond selecting credentials.

Set these environment variables in the backend secret manager:

| Variable | Purpose |
| --- | --- |
| `RAZORPAY_MODE` | Required selector: exactly `test` or `live`. No implicit default is used. |
| `RAZORPAY_TEST_KEY_ID` | Test account public Key ID. |
| `RAZORPAY_TEST_KEY_SECRET` | Test account API secret. |
| `RAZORPAY_TEST_WEBHOOK_SECRET` | Independent signing secret configured on the Test webhook. |
| `RAZORPAY_LIVE_KEY_ID` | Live account public Key ID. |
| `RAZORPAY_LIVE_KEY_SECRET` | Live account API secret. |
| `RAZORPAY_LIVE_WEBHOOK_SECRET` | Independent signing secret configured on the Live webhook. |

The backend returns the active mode's public Key ID as `key_id` in its existing payment-order response. The frontend uses that value to initialize Checkout; it does not contain or receive either API or webhook secret. API calls, payment signature checks, provider fetches, and refunds use the active mode's credentials. Webhook HMAC checks use the active mode's webhook secret. Keep Test and Live webhook secrets independent, and register the same webhook events at the existing `POST /api/v1/bookings/webhook` endpoint for each Razorpay environment. Raw JSON must remain available for HMAC verification. The API also verifies the payment entity and matches its order, amount, currency, and booking before confirmation.

### Live-mode activation

1. Obtain the Live Key ID and Key Secret from the Razorpay Live account and store them as `RAZORPAY_LIVE_KEY_ID` and `RAZORPAY_LIVE_KEY_SECRET` in the production secret manager. Do not copy Test credentials into Live variables.
2. Create a Live webhook in Razorpay for `payment.captured`, `refund.processed`, and `refund.failed`; set a new independent signing secret as `RAZORPAY_LIVE_WEBHOOK_SECRET`.
3. Deploy/restart the backend with `RAZORPAY_MODE=live`. Ensure the frontend uses the backend's payment-order response for `key_id`. No source-code change or frontend key change is required.
4. Verify backend health and a controlled low-value Live payment, then verify the corresponding signed Live webhook is accepted and the booking is confirmed once. Also verify a refund against the Live provider before enabling normal customer traffic.
5. Keep `RAZORPAY_MODE=live` and the Live credentials only in the production environment. To return to Test, set `RAZORPAY_MODE=test` and restart the backend; no code changes are involved.

Changing the selector alone is not proof that Live payments work. This repository's automated tests use mocked Razorpay SDK responses; no actual Live payment, Live webhook, or Live refund has been verified here. Do not treat Live mode as verified until the controlled transaction and signed webhook have been confirmed in the deployed environment.

Refund recovery fetches the provider's refund list before retrying a timed-out request and tags requests with a stable receipt/notes reference. A retry is delayed while provider state is uncertain. If Razorpay cannot return the previous refund or its status remains ambiguous, the API fails closed for manual reconciliation; do not clear the local refund claim by hand without first checking the Razorpay dashboard.

The installed Razorpay SDK does not expose an idempotency-key option for refund creation. The stable receipt/notes reference and provider-list reconciliation narrow duplicate risk, but they cannot guarantee gateway-side exactly-once refund creation if Razorpay accepts a request and then omits it from refund-list results past the retry window. Escalate ambiguous cases for provider reconciliation rather than forcing another refund.

## Brevo and notification worker

Configure `BREVO_SMTP_HOST`, `BREVO_SMTP_PORT`, `BREVO_SMTP_USER`, `BREVO_SMTP_PASS`, and a verified `BREVO_SENDER_EMAIL`. These SMTP values are placeholders in `.env.example`; use a secret manager for real credentials. `FRONTEND_URL` is used for links in email. Optionally set `SAFAR_ADMIN_NOTIFICATION_EMAILS` to a comma-separated list of operations inboxes. Invalid addresses are ignored; no address is guessed.

The dedicated Render background worker connects to MongoDB and processes the persistent outbox. Booking confirmation, cancellation, expiry, failed payment, and refund state transitions write their notification jobs in the same transaction as the business-state change. The worker claims jobs with a lease, retries with exponential backoff, records a safe error code, and dead-letters after eight attempts. Stable per-booking event keys prevent duplicate jobs. A periodic state reconciler repairs jobs for older transition paths, and upcoming reminders are queued once for paid confirmed bookings within seven days of departure. MongoDB leases still prevent duplicate claims if multiple worker instances are intentionally run.

Email delivery is at-least-once across the SMTP/network boundary. Stable Message-ID values help downstream deduplication, but SMTP cannot guarantee that a provider will not accept an email immediately before the worker loses its connection. An outbox job is marked sent only after SMTP acceptance; dead-letter jobs require operational review/requeue tooling.

## Environment and rollout

Copy `.env.example` into a local ignored `.env`, replace all placeholder values, and do not commit credentials. Use the Vite/API origins that match the deployment when setting `CORS_ORIGIN` and `FRONTEND_URL`. For a local replica-set development database, initialize the replica set before starting the backend. Verify the health endpoint, webhook configuration, and a test-mode booking/refund before production traffic.

## Operator follow-up

- Monitor logs for notification retry/dead-letter and transaction capability warnings; logs intentionally omit payloads, tokens, credentials, and email bodies.
- Inspect `NotificationOutbox` records with `status: "dead"` and reconcile their business state before any manual retry.
- Use the admin-only `POST /api/v1/bookings/admin/:bookingId/refund/retry` endpoint only after the gateway has confirmed a failed refund or when a timed-out refund can safely be reconciled.
- Refund eligibility remains the existing Safar policy: customers may cancel unpaid pending reservations; admin cancellation of a paid booking starts a full refund. Customer-initiated cancellation of paid bookings or partial/policy-based refunds need a separately specified business policy.
