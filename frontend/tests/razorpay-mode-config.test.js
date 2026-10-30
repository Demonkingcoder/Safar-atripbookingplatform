import assert from 'node:assert/strict'
import test from 'node:test'
import { getRazorpayClient, getRazorpayConfiguration, isRazorpayApiConfigured } from '../../src/utils/razorpay.js'

test('Test and Live select isolated credentials through the same Razorpay client factory', () => {
  const keys = [
    'RAZORPAY_MODE',
    'RAZORPAY_TEST_KEY_ID', 'RAZORPAY_TEST_KEY_SECRET', 'RAZORPAY_TEST_WEBHOOK_SECRET',
    'RAZORPAY_LIVE_KEY_ID', 'RAZORPAY_LIVE_KEY_SECRET', 'RAZORPAY_LIVE_WEBHOOK_SECRET',
  ]
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
  try {
    Object.assign(process.env, {
      RAZORPAY_MODE: 'test',
      RAZORPAY_TEST_KEY_ID: 'test-public-key',
      RAZORPAY_TEST_KEY_SECRET: 'test-api-secret',
      RAZORPAY_TEST_WEBHOOK_SECRET: 'test-webhook-secret',
      RAZORPAY_LIVE_KEY_ID: 'live-public-key',
      RAZORPAY_LIVE_KEY_SECRET: 'live-api-secret',
      RAZORPAY_LIVE_WEBHOOK_SECRET: 'live-webhook-secret',
    })

    assert.deepEqual(getRazorpayConfiguration(), {
      mode: 'test', keyId: 'test-public-key', keySecret: 'test-api-secret', webhookSecret: 'test-webhook-secret',
    })
    assert.equal(getRazorpayClient().key_id, 'test-public-key')
    assert.equal(isRazorpayApiConfigured(), true)

    process.env.RAZORPAY_MODE = 'live'
    assert.deepEqual(getRazorpayConfiguration(), {
      mode: 'live', keyId: 'live-public-key', keySecret: 'live-api-secret', webhookSecret: 'live-webhook-secret',
    })
    assert.equal(getRazorpayClient().key_id, 'live-public-key')
    assert.equal(isRazorpayApiConfigured(), true)
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

test('invalid mode fails closed without falling back to another environment', () => {
  const previousMode = process.env.RAZORPAY_MODE
  try {
    process.env.RAZORPAY_MODE = 'production'
    assert.equal(isRazorpayApiConfigured(), false)
    assert.throws(() => getRazorpayConfiguration(), /RAZORPAY_MODE must be set to test or live/)
  } finally {
    if (previousMode === undefined) delete process.env.RAZORPAY_MODE
    else process.env.RAZORPAY_MODE = previousMode
  }
})
