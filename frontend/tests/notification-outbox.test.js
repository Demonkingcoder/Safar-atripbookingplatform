import assert from 'node:assert/strict'
import test from 'node:test'
import mongoose from 'mongoose'
import Booking from '../../src/models/Booking.js'
import Departure from '../../src/models/Departure.js'
import NotificationOutbox from '../../src/models/NotificationOutbox.js'
import Trip from '../../src/models/Trip.js'
import User from '../../src/models/User.js'
import { enqueueUpcomingTripReminders, processNotificationOutboxBatch } from '../../src/utils/notification-outbox.js'

function query(value) { return { select: async () => value } }

async function withOutboxFixture(run) {
  const models = [NotificationOutbox, Booking, Departure, Trip, User]
  const originalReadyState = mongoose.connection.readyState
  const originals = models.map((model) => ({ model, find: model.find, findById: model.findById, findOneAndUpdate: model.findOneAndUpdate, updateOne: model.updateOne }))
  mongoose.connection.readyState = 1
  try {
    await run()
  } finally {
    mongoose.connection.readyState = originalReadyState
    for (const original of originals) {
      for (const method of ['find', 'findById', 'findOneAndUpdate', 'updateOne']) {
        if (original[method]) original.model[method] = original[method]
      }
    }
  }
}

function installContentFixture({ failDelivery = false } = {}) {
  let claimAvailable = true
  const job = { _id: 'outbox-1', eventKey: 'booking:b1:booking_confirmed:1', type: 'booking_confirmed', user: 'u1', booking: 'b1', attempts: 1, lockToken: 'worker-lock' }
  const updates = []
  const sent = []
  NotificationOutbox.findOneAndUpdate = async () => {
    if (!claimAvailable) return null
    claimAvailable = false
    return job
  }
  NotificationOutbox.updateOne = async (filter, update) => { updates.push(update.$set); return { matchedCount: 1 } }
  User.findById = () => query({ email: 'traveler@example.test', fullName: 'Test Traveler' })
  Booking.findById = () => query({ trip: 't1', departure: 'd1', bookingReference: 'SAF-1', numberOfSeats: 2, totalAmount: 5000 })
  Trip.findById = () => query({ title: 'Mountain escape' })
  Departure.findById = () => query({ startDate: new Date('2027-02-01T00:00:00Z') })
  const mailSender = async (message) => {
    sent.push(message)
    if (failDelivery) { const error = new Error('private transport detail'); error.code = 'ECONNECTION'; throw error }
  }
  return { job, updates, sent, mailSender }
}

test('outbox worker claims and sends one booking message with a stable message ID', async () => {
  await withOutboxFixture(async () => {
    const fixture = installContentFixture()
    const count = await processNotificationOutboxBatch({ mailSender: fixture.mailSender, batchSize: 1 })
    assert.equal(count, 1)
    assert.equal(fixture.sent.length, 1)
    assert.match(fixture.sent[0].subject, /confirmed/i)
    assert.match(fixture.sent[0].messageId, /^<safar-[a-f0-9]{64}@notifications\.safar>$/)
    assert.equal(fixture.updates.at(-1).status, 'sent')
  })
})

test('outbox delivery retries with backoff and stores only a safe error code', async () => {
  await withOutboxFixture(async () => {
    const fixture = installContentFixture({ failDelivery: true })
    const now = new Date()
    const originalError = console.error
    console.error = () => {}
    try {
      const count = await processNotificationOutboxBatch({ mailSender: fixture.mailSender, now, batchSize: 1 })
      assert.equal(count, 1)
      const retry = fixture.updates.at(-1)
      assert.equal(retry.status, 'pending')
      assert.equal(retry.lastErrorCode, 'ECONNECTION')
      assert.ok(retry.nextAttemptAt > now)
      assert.doesNotMatch(JSON.stringify(retry), /private transport detail/)
    } finally {
      console.error = originalError
    }
  })
})

test('outbox does not mark a message sent when SMTP rejects its recipient', async () => {
  await withOutboxFixture(async () => {
    const fixture = installContentFixture()
    fixture.mailSender = async () => ({ accepted: [], rejected: ['traveler@example.test'] })
    const originalError = console.error
    console.error = () => {}
    try {
      await processNotificationOutboxBatch({ mailSender: fixture.mailSender, batchSize: 1 })
      assert.equal(fixture.updates.at(-1).status, 'pending')
      assert.equal(fixture.updates.at(-1).lastErrorCode, 'recipient_not_accepted')
    } finally {
      console.error = originalError
    }
  })
})

test('concurrent worker passes cannot both claim and send the same outbox notification', async () => {
  await withOutboxFixture(async () => {
    const fixture = installContentFixture()
    const [first, second] = await Promise.all([
      processNotificationOutboxBatch({ mailSender: fixture.mailSender, batchSize: 1 }),
      processNotificationOutboxBatch({ mailSender: fixture.mailSender, batchSize: 1 }),
    ])
    assert.equal(first + second, 1)
    assert.equal(fixture.sent.length, 1)
    assert.equal(fixture.updates.at(-1).status, 'sent')
  })
})

test('upcoming reminders queue only paid confirmed trips within seven days and use stable event keys', async () => {
  await withOutboxFixture(async () => {
    const now = new Date('2026-11-01T00:00:00Z')
    const bookings = [
      { _id: 'booking-soon', user: 'u1', departure: { startDate: new Date('2026-11-05T00:00:00Z') }, status: 'confirmed', paymentStatus: 'paid' },
      { _id: 'booking-later', user: 'u2', departure: { startDate: new Date('2026-11-20T00:00:00Z') }, status: 'confirmed', paymentStatus: 'paid' },
      { _id: 'booking-past', user: 'u3', departure: { startDate: new Date('2026-10-31T00:00:00Z') }, status: 'confirmed', paymentStatus: 'paid' },
    ]
    const eventKeys = []
    Departure.find = () => ({ select() { return this }, async lean() { return [{ _id: 'departure-soon' }] } })
    Booking.find = () => ({ async lean() { return [bookings[0]] } })
    NotificationOutbox.updateOne = async (filter) => { eventKeys.push(filter.eventKey); return { upsertedCount: 1 } }
    assert.equal(await enqueueUpcomingTripReminders(now), 1)
    assert.deepEqual(eventKeys, ['booking:booking-soon:upcoming_trip_reminder'])
    assert.equal(await enqueueUpcomingTripReminders(now), 1)
    assert.equal(eventKeys.length, 2)
    assert.equal(eventKeys[0], eventKeys[1])
  })
})
