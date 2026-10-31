import assert from 'node:assert/strict'
import test from 'node:test'
import { validateRuntimeConfiguration } from '../../src/utils/runtime-configuration.js'
import { findUniqueIndexConflicts } from '../../src/utils/index-preflight.js'

const names = [
  'NODE_ENV', 'MONGO_URI', 'FRONTEND_URL', 'API_PUBLIC_URL', 'COOKIE_SITE_DOMAIN', 'COOKIE_DOMAIN', 'CORS_ORIGIN', 'BREVO_API_KEY',
  'BREVO_SENDER_EMAIL', 'BREVO_SENDER_NAME', 'RUN_NOTIFICATION_WORKER',
  'ACCESS_TOKEN_SECRET', 'REFRESH_TOKEN_SECRET', 'COOKIE_SAME_SITE', 'RAZORPAY_MODE',
  'RAZORPAY_TEST_KEY_ID', 'RAZORPAY_TEST_KEY_SECRET', 'RAZORPAY_TEST_WEBHOOK_SECRET',
  'RAZORPAY_LIVE_KEY_ID', 'RAZORPAY_LIVE_KEY_SECRET', 'RAZORPAY_LIVE_WEBHOOK_SECRET',
]

function withProductionEnv(overrides, run) {
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]))
  const values = {
    NODE_ENV: 'production', MONGO_URI: 'mongodb+srv://cluster.example.test/safar',
    FRONTEND_URL: 'https://staging.safar.example', API_PUBLIC_URL: 'https://api-staging.safar.example',
    COOKIE_SITE_DOMAIN: 'safar.example', COOKIE_DOMAIN: '', CORS_ORIGIN: 'https://staging.safar.example',
    BREVO_API_KEY: 'brevo-api-key-placeholder', BREVO_SENDER_EMAIL: 'notifications@example.test', BREVO_SENDER_NAME: 'Safar',
    RUN_NOTIFICATION_WORKER: 'false', ACCESS_TOKEN_SECRET: 'access-secret-placeholder',
    REFRESH_TOKEN_SECRET: 'refresh-secret-placeholder', COOKIE_SAME_SITE: 'lax', RAZORPAY_MODE: 'test',
    RAZORPAY_TEST_KEY_ID: 'test-id', RAZORPAY_TEST_KEY_SECRET: 'test-secret', RAZORPAY_TEST_WEBHOOK_SECRET: 'test-webhook',
    RAZORPAY_LIVE_KEY_ID: 'live-id', RAZORPAY_LIVE_KEY_SECRET: 'live-secret', RAZORPAY_LIVE_WEBHOOK_SECRET: 'live-webhook',
    ...overrides,
  }
  for (const name of names) {
    if (values[name] === undefined) delete process.env[name]
    else process.env[name] = values[name]
  }
  try { return run() } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name]
      else process.env[name] = previous[name]
    }
  }
}

test('production runtime configuration accepts exact same-site staging origins', () => {
  withProductionEnv({}, () => {
    assert.equal(validateRuntimeConfiguration('api'), true)
    assert.equal(validateRuntimeConfiguration('worker'), true)
  })
})

test('production accepts cross-site Vercel and Render origins with Secure SameSite=None host-only cookies', async () => {
  const { cookieOptions } = await import('../../src/utils/token-policy.js')
  withProductionEnv({
    FRONTEND_URL: 'https://safar-preview.vercel.app',
    API_PUBLIC_URL: 'https://safar-api.onrender.com',
    COOKIE_SITE_DOMAIN: 'safar-api.onrender.com',
    COOKIE_DOMAIN: '',
    COOKIE_SAME_SITE: 'none',
    CORS_ORIGIN: 'https://safar-preview.vercel.app',
  }, () => {
    assert.equal(validateRuntimeConfiguration('api'), true)
    const cookie = cookieOptions(60_000)
    assert.equal(cookie.httpOnly, true)
    assert.equal(cookie.secure, true)
    assert.equal(cookie.sameSite, 'none')
    assert.equal(Object.hasOwn(cookie, 'domain'), false)
  })
})

test('production API rejects local fallbacks, wildcard CORS, and an API that starts a second worker', () => {
  withProductionEnv({ FRONTEND_URL: 'http://localhost:5173' }, () => {
    assert.throws(() => validateRuntimeConfiguration('api'), /public HTTPS origin/)
  })
  withProductionEnv({ CORS_ORIGIN: '*' }, () => {
    assert.throws(() => validateRuntimeConfiguration('api'), /exact public frontend origins/)
  })
  withProductionEnv({ RUN_NOTIFICATION_WORKER: 'true' }, () => {
    assert.throws(() => validateRuntimeConfiguration('api'), /RUN_NOTIFICATION_WORKER/)
  })
  withProductionEnv({ API_PUBLIC_URL: 'https://api.other.example' }, () => {
    assert.throws(() => validateRuntimeConfiguration('api'), /COOKIE_SITE_DOMAIN/)
  })
  withProductionEnv({ COOKIE_SAME_SITE: 'strict' }, () => {
    assert.throws(() => validateRuntimeConfiguration('api'), /COOKIE_SAME_SITE/)
  })
  withProductionEnv({ COOKIE_SAME_SITE: 'none', COOKIE_DOMAIN: 'safar.example' }, () => {
    assert.throws(() => validateRuntimeConfiguration('api'), /COOKIE_DOMAIN/)
  })
  withProductionEnv({ FRONTEND_URL: undefined }, () => {
    assert.throws(() => validateRuntimeConfiguration('api'), /FRONTEND_URL/)
  })
})

test('index preflight reports duplicate counts without exposing duplicate values', async () => {
  const seen = []
  const models = Object.fromEntries(['User', 'Trip', 'Booking', 'RefreshSession', 'PaymentWebhookEvent', 'NotificationOutbox'].map((name) => [name, {
    aggregate(pipeline) {
      seen.push(pipeline)
      return { allowDiskUse: async () => name === 'User' ? [{ duplicateGroups: 2 }] : [] }
    },
  }]))
  const conflicts = await findUniqueIndexConflicts(models)
  assert.deepEqual(conflicts, [{ index: 'User.email', duplicateGroups: 2 }, { index: 'User.mobile', duplicateGroups: 2 }])
  assert.equal(seen.length, 8)
  assert.ok(seen.some((pipeline) => JSON.stringify(pipeline).includes('idempotencyKey')))
  assert.doesNotMatch(JSON.stringify(conflicts), /customer|email@example/)
})
