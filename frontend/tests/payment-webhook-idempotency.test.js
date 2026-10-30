import assert from 'node:assert/strict'
import test from 'node:test'
import PaymentWebhookEvent from '../../src/models/PaymentWebhookEvent.js'

process.env.RAZORPAY_MODE = 'test'
process.env.RAZORPAY_TEST_KEY_ID = 'rzp_test_placeholder'
process.env.RAZORPAY_TEST_KEY_SECRET = 'webhook-test-secret'
const { claimWebhookEvent } = await import('../../src/controllers/bookingController.js')

test('webhook event IDs are persisted once, concurrent deliveries are held, and failed events can retry', async () => {
  const originals = Object.fromEntries(['findOne', 'create', 'findOneAndUpdate'].map((name) => [name, PaymentWebhookEvent[name]]))
  const now = new Date()
  const records = new Map()
  PaymentWebhookEvent.findOne = async ({ eventId }) => records.get(eventId) || null
  PaymentWebhookEvent.create = async (record) => {
    const stored = { _id: 'event-doc', attempts: 1, ...record }
    records.set(record.eventId, stored)
    return stored
  }
  PaymentWebhookEvent.findOneAndUpdate = async (filter, update) => {
    const record = [...records.values()].find((item) => item._id === filter._id)
    if (!record || record.status === 'processed') return null
    Object.assign(record, update.$set)
    record.attempts += update.$inc?.attempts || 0
    return record
  }

  try {
    assert.equal(await claimWebhookEvent('evt_1', 'payment.captured', 'payload-hash'), 'claimed')
    assert.equal(records.get('evt_1').status, 'processing')
    assert.equal(await claimWebhookEvent('evt_1', 'payment.captured', 'payload-hash'), 'busy')
    records.get('evt_1').status = 'processed'
    assert.equal(await claimWebhookEvent('evt_1', 'payment.captured', 'payload-hash'), 'processed')
    await assert.rejects(claimWebhookEvent('evt_1', 'payment.captured', 'different-hash'), (error) => error.statusCode === 409)
    records.get('evt_1').status = 'failed'
    assert.equal(await claimWebhookEvent('evt_1', 'payment.captured', 'payload-hash'), 'claimed')
    assert.equal(records.get('evt_1').attempts, 2)
    assert.ok(records.get('evt_1').leaseExpiresAt > now)
  } finally {
    for (const [name, method] of Object.entries(originals)) PaymentWebhookEvent[name] = method
  }
})
