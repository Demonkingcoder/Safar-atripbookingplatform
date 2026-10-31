import assert from 'node:assert/strict'
import test from 'node:test'
import Booking from '../../src/models/Booking.js'
import Departure from '../../src/models/Departure.js'
import Trip from '../../src/models/Trip.js'
import PaymentWebhookEvent from '../../src/models/PaymentWebhookEvent.js'
import NotificationOutbox from '../../src/models/NotificationOutbox.js'
import mongoose from 'mongoose'

process.env.RAZORPAY_MODE = 'test'
process.env.RAZORPAY_TEST_KEY_ID = 'rzp_test_placeholder'
process.env.RAZORPAY_TEST_KEY_SECRET = 'booking-flow-test-secret'
process.env.RAZORPAY_TEST_WEBHOOK_SECRET = 'webhook-test-secret'
delete process.env.BREVO_SENDER_EMAIL
const { default: razorpay } = await import('../../src/utils/razorpay.js')
const { createBooking, createPaymentOrder, cancelBooking, verifyPayment, handlePaymentWebhook, reconcilePaymentStatus, adminCancelBooking, adminRetryRefund, adminCancelDeparture } = await import('../../src/controllers/bookingController.js')
const { expirePendingBookings } = await import('../../src/utils/booking-expiration.js')
const crypto = await import('node:crypto')

function invoke(handler, req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: null,
      status(statusCode) { this.statusCode = statusCode; return this },
      json(body) { resolve({ statusCode: this.statusCode, body }); return this },
    }
    handler(req, res, (error) => resolve({ error }))
  })
}

async function withOverrides(overrides, run) {
  const outboxRecords = new Map()
  const outboxOverride = {
    model: NotificationOutbox,
    methods: {
      async updateOne(filter, update) {
        if (!outboxRecords.has(filter.eventKey)) outboxRecords.set(filter.eventKey, update.$setOnInsert)
        return { matchedCount: 1, upsertedCount: 1 }
      },
    },
  }
  const eventRecords = new Map()
  const webhookEventOverride = {
    model: PaymentWebhookEvent,
    methods: {
      async findOne({ eventId }) { return eventRecords.get(eventId) || null },
      async create(record) {
        if (eventRecords.has(record.eventId)) { const error = new Error("duplicate event"); error.code = 11000; throw error }
        const stored = { _id: record.eventId, ...record }
        eventRecords.set(record.eventId, stored)
        return stored
      },
      async findOneAndUpdate(filter, update) {
        const current = [...eventRecords.values()].find((record) => record._id === filter._id && record.payloadHash === filter.payloadHash)
        if (!current || current.status === "processed") return null
        Object.assign(current, update.$set || {})
        if (update.$inc?.attempts) current.attempts = (current.attempts || 0) + update.$inc.attempts
        delete current.lastErrorCode
        return current
      },
      async updateOne(filter, update) {
        const current = eventRecords.get(filter.eventId)
        if (!current || (filter.status && current.status !== filter.status)) return { matchedCount: 0 }
        Object.assign(current, update.$set || {})
        return { matchedCount: 1 }
      },
    },
  }
  const allOverrides = [...(overrides.some(({ model }) => model === mongoose) ? [] : [transactionOverride()]), ...overrides, webhookEventOverride, outboxOverride]
  const originals = allOverrides.map(({ model, methods }) => ({
    model,
    methods: Object.fromEntries(Object.keys(methods).map((name) => [name, model[name]])),
  }))
  for (const { model, methods } of allOverrides) Object.assign(model, methods)
  try { await run() } finally {
    for (const { model, methods } of originals) Object.assign(model, methods)
  }
}

function request({ userId = 'customer-a', departureId = '64b000000000000000000001', numberOfSeats = 1, notificationLanguage, key } = {}) {
  return {
    user: { _id: userId },
    body: { departureId, numberOfSeats, notificationLanguage },
    get(name) { return name === 'Idempotency-Key' ? key : undefined },
  }
}

function makeSeatInventory(initialSeats) {
  let availableSeats = initialSeats
  const bookings = []
  const departure = { _id: '64b000000000000000000001', trip: 'trip-a', price: 250, availableSeats, status: 'scheduled', startDate: new Date(Date.now() + 86400000) }
  return {
    bookings,
    get seats() { return availableSeats },
    async reserve(filter, update) {
      if (availableSeats < filter.availableSeats.$gte || filter._id !== departure._id) return null
      availableSeats += update.$inc.availableSeats
      departure.availableSeats = availableSeats
      return { ...departure }
    },
    methods: {
      Departure: {
        async findOne() { return { ...departure } },
        findOneAndUpdate(filter, update) { return this.reserve(filter, update) },
      },
      Trip: { async findOne() { return { _id: 'trip-a' } } },
      Booking: {
        async findOne(filter) { return bookings.find((booking) => booking.user === filter.user && booking.idempotencyKey === filter.idempotencyKey) || null },
        async create(records) {
          const data = Array.isArray(records) ? records[0] : records
          if (data.idempotencyKey && bookings.some((booking) => booking.user === data.user && booking.idempotencyKey === data.idempotencyKey)) {
            const error = new Error('Duplicate key'); error.code = 11000; throw error
          }
          const booking = { _id: `booking-${bookings.length + 1}`, ...data }
          bookings.push(booking)
          return [booking]
        },
      },
    },
  }
}

function inventoryOverrides(inventory) {
  return [
    transactionOverride(),
    { model: Departure, methods: { ...inventory.methods.Departure, reserve: inventory.reserve } },
    { model: Trip, methods: inventory.methods.Trip },
    { model: Booking, methods: inventory.methods.Booking },
  ]
}

function transactionOverride() {
  return { model: mongoose, methods: { async startSession() { return { async withTransaction(callback) { await callback() }, async endSession() {} } } } }
}
test('one booking reserves and prices four travellers on the server', async () => {
  const inventory = makeSeatInventory(4)
  await withOverrides(inventoryOverrides(inventory), async () => {
    const result = await invoke(createBooking, request({ numberOfSeats: 4, key: 'four-seat-booking' }))
    const booking = result.body.data.booking
    assert.equal(result.statusCode, 201)
    assert.equal(booking.numberOfSeats, 4)
    assert.equal(booking.totalAmount, 1000)
    assert.equal(inventory.seats, 0)
  })
})

test('booking snapshots only a supported email language with English fallback', async () => {
  for (const [requestedLanguage, expectedLanguage] of [['hi', 'hi'], ['fr', 'en']]) {
    const inventory = makeSeatInventory(2)
    await withOverrides(inventoryOverrides(inventory), async () => {
      const result = await invoke(createBooking, request({ notificationLanguage: requestedLanguage, key: `locale-${requestedLanguage}` }))
      assert.equal(result.body.data.booking.notificationLanguage, expectedLanguage)
    })
  }
})

test('separate intentional bookings for one departure are allowed while seats remain', async () => {
  const inventory = makeSeatInventory(3)
  await withOverrides(inventoryOverrides(inventory), async () => {
    const first = await invoke(createBooking, request({ numberOfSeats: 1, key: 'intentional-1' }))
    const second = await invoke(createBooking, request({ numberOfSeats: 1, key: 'intentional-2' }))
    assert.equal(first.statusCode, 201)
    assert.equal(second.statusCode, 201)
    assert.equal(inventory.bookings.length, 2)
    assert.equal(inventory.seats, 1)
  })
})

test('retries with the same idempotency key return one booking without reserving twice', async () => {
  const inventory = makeSeatInventory(2)
  await withOverrides(inventoryOverrides(inventory), async () => {
    const first = await invoke(createBooking, request({ numberOfSeats: 1, key: 'retry-safe' }))
    const retry = await invoke(createBooking, request({ numberOfSeats: 1, key: 'retry-safe' }))
    assert.equal(first.statusCode, 201)
    assert.equal(retry.statusCode, 200)
    assert.equal(retry.body.data.booking._id, first.body.data.booking._id)
    assert.equal(inventory.bookings.length, 1)
    assert.equal(inventory.seats, 1)
  })
})

test('booking creation requires an idempotency key before reserving seats', async () => {
  const inventory = makeSeatInventory(1)
  await withOverrides(inventoryOverrides(inventory), async () => {
    const result = await invoke(createBooking, request())
    assert.equal(result.error?.statusCode, 400)
    assert.equal(inventory.seats, 1)
    assert.equal(inventory.bookings.length, 0)
  })
})

test('atomic seat reservation allows only one customer to reserve the final seat', async () => {
  const inventory = makeSeatInventory(1)
  await withOverrides(inventoryOverrides(inventory), async () => {
    const results = await Promise.all([
      invoke(createBooking, request({ userId: 'customer-a', key: 'last-seat-a' })),
      invoke(createBooking, request({ userId: 'customer-b', key: 'last-seat-b' })),
    ])
    assert.equal(results.filter((result) => result.statusCode === 201).length, 1)
    assert.equal(results.filter((result) => result.error?.statusCode === 409).length, 1)
    assert.equal(inventory.seats, 0)
  })
})

test('valid signed payment confirmation succeeds once and repeated verification is idempotent', async () => {
  const booking = {
    _id: '64b000000000000000000003', user: 'customer-a', status: 'pending', paymentStatus: 'pending', totalAmount: 250,
    razorpayOrderId: 'order-a', expiresAt: new Date(Date.now() + 60000),
  }
  const paymentId = 'pay-a'
  const signature = crypto.createHmac('sha256', process.env.RAZORPAY_TEST_KEY_SECRET).update('order-a|pay-a').digest('hex')
  let paidUpdates = 0
  await withOverrides([{ model: Booking, methods: {
    async findOne() { return { ...booking } },
    async findOneAndUpdate(filter, update) {
      if (booking.paymentStatus === 'paid') return null
      paidUpdates += 1
      Object.assign(booking, update.$set)
      return { ...booking }
    },
  } }, { model: razorpay, methods: { payments: { ...razorpay.payments, async fetch(id) { return { id, order_id: 'order-a', amount: 25000, currency: 'INR', status: 'captured' } } } } }], async () => {
    const req = { params: { bookingId: booking._id }, user: { _id: 'customer-a' }, body: { razorpay_order_id: 'order-a', razorpay_payment_id: paymentId, razorpay_signature: signature } }
    assert.equal((await invoke(verifyPayment, req)).statusCode, 200)
    assert.equal((await invoke(verifyPayment, req)).statusCode, 200)
    assert.equal(paidUpdates, 1)
    assert.equal(booking.status, 'confirmed')
  })
})

test('the shared payment signature verification path accepts the configured Live credentials', async () => {
  const previousMode = process.env.RAZORPAY_MODE
  const previousKeyId = process.env.RAZORPAY_LIVE_KEY_ID
  const previousKeySecret = process.env.RAZORPAY_LIVE_KEY_SECRET
  process.env.RAZORPAY_MODE = 'live'
  process.env.RAZORPAY_LIVE_KEY_ID = 'live-public-key'
  process.env.RAZORPAY_LIVE_KEY_SECRET = 'live-api-secret'
  try {
    const booking = {
      _id: '64b000000000000000000031', user: 'customer-a', status: 'pending', paymentStatus: 'pending', totalAmount: 250,
      razorpayOrderId: 'order-live', expiresAt: new Date(Date.now() + 60000),
    }
    const signature = crypto.createHmac('sha256', process.env.RAZORPAY_LIVE_KEY_SECRET).update('order-live|pay-live').digest('hex')
    await withOverrides([
      { model: Booking, methods: {
        async findOne() { return booking },
        async findOneAndUpdate(_filter, update) { Object.assign(booking, update.$set); return { ...booking } },
      } },
      { model: razorpay, methods: { payments: { ...razorpay.payments, async fetch(id) { return { id, order_id: 'order-live', amount: 25000, currency: 'INR', status: 'captured' } } } } },
    ], async () => {
      const result = await invoke(verifyPayment, {
        params: { bookingId: booking._id }, user: { _id: 'customer-a' },
        body: { razorpay_order_id: 'order-live', razorpay_payment_id: 'pay-live', razorpay_signature: signature },
      })
      assert.equal(result.statusCode, 200)
      assert.equal(booking.paymentStatus, 'paid')
      assert.equal(booking.status, 'confirmed')
    })
  } finally {
    if (previousMode === undefined) delete process.env.RAZORPAY_MODE
    else process.env.RAZORPAY_MODE = previousMode
    if (previousKeyId === undefined) delete process.env.RAZORPAY_LIVE_KEY_ID
    else process.env.RAZORPAY_LIVE_KEY_ID = previousKeyId
    if (previousKeySecret === undefined) delete process.env.RAZORPAY_LIVE_KEY_SECRET
    else process.env.RAZORPAY_LIVE_KEY_SECRET = previousKeySecret
  }
})

test('webhook verification selects the Live webhook secret while retaining the shared handler', async () => {
  const previousMode = process.env.RAZORPAY_MODE
  const previousWebhookSecret = process.env.RAZORPAY_LIVE_WEBHOOK_SECRET
  process.env.RAZORPAY_MODE = 'live'
  process.env.RAZORPAY_LIVE_WEBHOOK_SECRET = 'live-webhook-secret'
  try {
    const rawBody = Buffer.from(JSON.stringify({ event: 'test.ping', payload: {} }))
    const signature = crypto.createHmac('sha256', process.env.RAZORPAY_LIVE_WEBHOOK_SECRET).update(rawBody).digest('hex')
    await withOverrides([], async () => {
      const result = await invoke(handlePaymentWebhook, {
        rawBody,
        body: JSON.parse(rawBody.toString()),
        get(name) {
          if (name === 'x-razorpay-signature') return signature
          if (name === 'x-razorpay-event-id') return 'live-event-1'
          return undefined
        },
      })
      assert.equal(result.statusCode, 200)
    })
  } finally {
    if (previousMode === undefined) delete process.env.RAZORPAY_MODE
    else process.env.RAZORPAY_MODE = previousMode
    if (previousWebhookSecret === undefined) delete process.env.RAZORPAY_LIVE_WEBHOOK_SECRET
    else process.env.RAZORPAY_LIVE_WEBHOOK_SECRET = previousWebhookSecret
  }
})

test('payment order returns the active mode public Key ID for Checkout', async () => {
  const booking = {
    _id: '64b000000000000000000030', user: 'customer-a', status: 'pending', paymentStatus: 'pending',
    totalAmount: 250, razorpayOrderId: null,
  }
  await withOverrides([
    { model: Booking, methods: {
      async findOne() { return booking },
      async findOneAndUpdate(_filter, update) {
        if (update.$set.razorpayOrderId) booking.razorpayOrderId = update.$set.razorpayOrderId
        return booking
      },
      async updateOne() { return { matchedCount: 1 } },
    } },
    { model: razorpay, methods: { orders: { async create({ amount, currency }) { return { id: 'order-mode-test', amount, currency } } } } },
  ], async () => {
    const result = await invoke(createPaymentOrder, {
      params: { bookingId: booking._id }, user: { _id: 'customer-a' },
    })
    assert.equal(result.statusCode, 200)
    assert.equal(result.body.data.key_id, process.env.RAZORPAY_TEST_KEY_ID)
    assert.equal(result.body.data.order_id, 'order-mode-test')
  })
})

test('payment provider order errors return a safe 502 and sanitized request diagnostics', async () => {
  const booking = { _id: '64b000000000000000000039', user: 'customer-a', status: 'pending', paymentStatus: 'pending', totalAmount: 250, razorpayOrderId: null }
  const originalConsoleError = console.error
  const logs = []
  console.error = (...args) => logs.push(args.join(' '))
  try {
    await withOverrides([
      { model: Booking, methods: {
        async findOne() { return booking },
        async findOneAndUpdate() { return booking },
        async updateOne() { return { matchedCount: 1 } },
      } },
      { model: razorpay, methods: { orders: { async create() { const error = new Error('provider response contains private details'); error.code = 'ETIMEDOUT'; throw error } } } },
    ], async () => {
      const result = await invoke(createPaymentOrder, {
        params: { bookingId: booking._id }, user: { _id: 'customer-a' }, requestId: 'req-payment-safe',
      })
      assert.equal(result.error?.statusCode, 502)
      assert.match(result.error.message, /payment provider is temporarily unavailable|could not prepare checkout/i)
      assert.equal(result.error.message.includes('private details'), false)
      assert.equal(logs.some((line) => line.includes('req-payment-safe') && line.includes(booking._id) && line.includes('create_order') && line.includes('network')), true)
      assert.equal(logs.some((line) => line.includes('private details')), false)
    })
  } finally {
    console.error = originalConsoleError
  }
})

test('invalid payment signature leaves booking unconfirmed', async () => {
  const booking = { _id: '64b000000000000000000004', user: 'customer-a', status: 'pending', paymentStatus: 'pending', razorpayOrderId: 'order-a' }
  let updateCalled = false
  await withOverrides([{ model: Booking, methods: {
    async findOne() { return booking },
    async findOneAndUpdate() { updateCalled = true; return null },
  } }], async () => {
    const result = await invoke(verifyPayment, { params: { bookingId: booking._id }, user: { _id: 'customer-a' }, body: { razorpay_order_id: 'order-a', razorpay_payment_id: 'pay-a', razorpay_signature: 'invalid' } })
    assert.equal(result.error?.statusCode, 400)
    assert.equal(updateCalled, false)
    assert.equal(booking.status, 'pending')
  })
})

test('a late captured payment on a cancelled booking starts a refund without restoring released seats', async () => {
  const booking = { _id: '64b000000000000000000005', user: 'customer-a', status: 'cancelled', paymentStatus: 'failed', razorpayOrderId: 'order-cancelled', totalAmount: 250, seatsReleasedAt: new Date() }
  const signature = crypto.createHmac('sha256', process.env.RAZORPAY_TEST_KEY_SECRET).update('order-cancelled|pay-late').digest('hex')
  let updateCalled = false
  let refundCalls = 0
  await withOverrides([{ model: Booking, methods: {
    async findOne() { return booking },
    async findOneAndUpdate(filter, update) {
      if (filter.refundId === null && booking.refundId) return null
      if (filter.refundRequestedAt === null && booking.refundRequestedAt) return null
      updateCalled = true
      Object.assign(booking, update.$set)
      if (update.$set.refundRequestedAt) booking.refundRequestedAt = update.$set.refundRequestedAt
      return booking
    },
    async findById() { return booking },
  } }, { model: razorpay, methods: { payments: { ...razorpay.payments, async fetch(id) { return { id, order_id: 'order-cancelled', amount: 25000, currency: 'INR', status: 'captured' } }, async fetchRefund(id, refundId) { return { id: refundId, payment_id: id, amount: 25000, status: 'pending' } }, async refund(id) { refundCalls += 1; return { id: 'refund-late', payment_id: id, amount: 25000, status: 'pending' } } } } }], async () => {
    const result = await invoke(verifyPayment, { params: { bookingId: booking._id }, user: { _id: booking.user }, body: { razorpay_order_id: booking.razorpayOrderId, razorpay_payment_id: 'pay-late', razorpay_signature: signature } })
    assert.equal(result.statusCode, 202)
    assert.equal(updateCalled, true)
    assert.equal(refundCalls, 1)
    assert.equal(booking.status, 'refund_pending')
    assert.equal(booking.paymentStatus, 'refund_pending')
    const duplicate = await invoke(verifyPayment, { params: { bookingId: booking._id }, user: { _id: booking.user }, body: { razorpay_order_id: booking.razorpayOrderId, razorpay_payment_id: 'pay-late', razorpay_signature: signature } })
    assert.equal(duplicate.statusCode, 202)
    assert.equal(refundCalls, 1)
  })
})

test('cancellation releases the reservation and records a failed payment state', async () => {
  const booking = { _id: '64b000000000000000000002', user: 'customer-a', departure: 'departure-a', numberOfSeats: 2, status: 'pending', paymentStatus: 'pending' }
  let releasedSeats = 0
  await withOverrides([
    transactionOverride(),
    { model: Booking, methods: { async findOne() { return booking }, async findOneAndUpdate(filter, update) { Object.assign(booking, update.$set); return booking } } },
    { model: Departure, methods: { async updateOne(filter, update) { releasedSeats += update.$inc.availableSeats; return { matchedCount: 1 } } } },
  ], async () => {
    const result = await invoke(cancelBooking, { params: { bookingId: booking._id }, user: { _id: booking.user } })
    assert.equal(result.statusCode, 200)
    assert.equal(releasedSeats, 2)
    assert.equal(booking.status, 'cancelled')
    assert.equal(booking.paymentStatus, 'failed')
    const duplicate = await invoke(cancelBooking, { params: { bookingId: booking._id }, user: { _id: booking.user } })
    assert.equal(duplicate.error?.statusCode, 409)
    assert.equal(releasedSeats, 2)
  })
})

test('duplicate customer cancellation releases reserved seats exactly once', async () => {
  const booking = { _id: '64b000000000000000000020', user: 'customer-cancel', departure: 'departure-cancel', numberOfSeats: 2, status: 'pending', paymentStatus: 'pending', seatsReleasedAt: null }
  let availableSeats = 3
  await withOverrides([
    transactionOverride(),
    { model: Booking, methods: {
      async findOne() { return booking },
      async findOneAndUpdate(filter, update) {
        const statusMatches = filter.status?.$in ? filter.status.$in.includes(booking.status) : filter.status === booking.status
        if (!statusMatches || booking.seatsReleasedAt !== null) return null
        Object.assign(booking, update.$set)
        return booking
      },
    } },
    { model: Departure, methods: { async updateOne(filter, update) { availableSeats += update.$inc.availableSeats; return { matchedCount: 1 } } } },
  ], async () => {
    const request = { params: { bookingId: booking._id }, user: { _id: booking.user } }
    assert.equal((await invoke(cancelBooking, request)).statusCode, 200)
    const duplicate = await invoke(cancelBooking, request)
    assert.equal(duplicate.error?.statusCode, 409)
    assert.equal(booking.status, 'cancelled')
    assert.equal(availableSeats, 5)
  })
})

test('expired pending bookings are transitioned and their seats are released once', async () => {
  const now = new Date()
  const booking = { _id: 'booking-expired', departure: 'departure-expired', numberOfSeats: 3, status: 'pending', paymentStatus: 'pending', expiresAt: new Date(now.getTime() - 1000) }
  let releasedSeats = 0
  await withOverrides([
    transactionOverride(),
    { model: Booking, methods: {
      find() { return { select() { return this }, async lean() { return booking.status === 'pending' ? [{ ...booking }] : [] } } },
      async findOne() { return booking },
      async findOneAndUpdate(filter, update) {
        if (update.$set.status && booking.status !== 'pending') return null
        if (!update.$set.status && booking.status !== 'expired') return null
        Object.assign(booking, update.$set)
        return booking
      },
    } },
    { model: Departure, methods: { async updateOne(filter, update) { releasedSeats += update.$inc.availableSeats; return { matchedCount: 1 } } } },
  ], async () => {
    assert.equal(await expirePendingBookings(now), 1)
    assert.equal(booking.status, 'expired')
    assert.equal(booking.paymentStatus, 'failed')
    assert.equal(releasedSeats, 3)
    assert.equal(await expirePendingBookings(now), 0)
    assert.equal(releasedSeats, 3)
  })
})

test('expiry job retains seats while the payment provider reports an unresolved authorization', async () => {
  const now = new Date()
  const booking = { _id: '64b00000000000000000000e', status: 'pending', paymentStatus: 'pending', razorpayOrderId: 'order-authorized', expiresAt: new Date(now.getTime() - 1000) }
  await withOverrides([
    { model: Booking, methods: {
      find() { return { select() { return this }, async lean() { return [{ _id: booking._id }] } } },
      async findOne() { return booking },
    } },
    { model: razorpay, methods: { orders: { ...razorpay.orders, async fetchPayments() { return { items: [{ status: 'authorized' }] } } } } },
  ], async () => {
    assert.equal(await expirePendingBookings(now), 0)
    assert.equal(booking.status, 'pending')
    assert.equal(booking.paymentStatus, 'pending')
  })
})

test('provider-confirmed failed payment marks the booking failed and releases seats once', async () => {
  const booking = { _id: '64b000000000000000000006', user: 'customer-a', departure: 'departure-failed', numberOfSeats: 2, totalAmount: 500, status: 'pending', paymentStatus: 'pending', razorpayOrderId: 'order-failed' }
  let releasedSeats = 0
  await withOverrides([
    transactionOverride(),
    { model: Booking, methods: {
      async findOne() { return booking },
      async findOneAndUpdate(filter, update) { Object.assign(booking, update.$set); return booking },
    } },
    { model: Departure, methods: { async updateOne(filter, update) { releasedSeats += update.$inc.availableSeats; return { matchedCount: 1 } } } },
    { model: razorpay, methods: {
      payments: { ...razorpay.payments, async fetch(id) { return { id, order_id: 'order-failed', amount: 50000, currency: 'INR', status: 'failed' } } },
      orders: { ...razorpay.orders, async fetchPayments() { return { items: [{ status: 'failed' }] } } },
    } },
  ], async () => {
    const result = await invoke(verifyPayment, {
      params: { bookingId: booking._id }, user: { _id: booking.user },
      body: { razorpay_order_id: 'order-failed', razorpay_payment_id: 'pay-failed', razorpay_signature: crypto.createHmac('sha256', process.env.RAZORPAY_TEST_KEY_SECRET).update('order-failed|pay-failed').digest('hex') },
    })
    assert.equal(result.error?.statusCode, 409)
    assert.match(result.error.message, /no tickets have been issued/i)
    assert.equal(booking.status, 'failed')
    assert.equal(releasedSeats, 2)
  })
})

test('pending provider payment is not cancelled or released while its state is unresolved', async () => {
  const booking = { _id: '64b000000000000000000007', user: 'customer-a', departure: 'departure-pending', numberOfSeats: 1, status: 'pending', paymentStatus: 'pending', razorpayOrderId: 'order-pending' }
  let releaseCalled = false
  await withOverrides([
    { model: Booking, methods: { async findOne() { return booking }, async findOneAndUpdate() { releaseCalled = true; return null } } },
    { model: razorpay, methods: { orders: { ...razorpay.orders, async fetchPayments() { return { items: [{ status: 'authorized' }] } } } } },
  ], async () => {
    const result = await invoke(cancelBooking, { params: { bookingId: booking._id }, user: { _id: booking.user } })
    assert.equal(result.error?.statusCode, 409)
    assert.equal(releaseCalled, false)
    assert.equal(booking.status, 'pending')
  })
})

test('checkout dismissal reconciles an empty provider payment list and releases the unpaid reservation', async () => {
  const booking = { _id: '64b00000000000000000000b', user: 'customer-a', departure: 'departure-empty', numberOfSeats: 1, status: 'pending', paymentStatus: 'pending', razorpayOrderId: 'order-empty' }
  let releasedSeats = 0
  await withOverrides([
    transactionOverride(),
    { model: Booking, methods: { async findOne() { return booking }, async findOneAndUpdate(filter, update) { Object.assign(booking, update.$set); return booking } } },
    { model: Departure, methods: { async updateOne(filter, update) { releasedSeats += update.$inc.availableSeats; return { matchedCount: 1 } } } },
    { model: razorpay, methods: { orders: { ...razorpay.orders, async fetchPayments() { return { items: [] } } } } },
  ], async () => {
    const result = await invoke(reconcilePaymentStatus, { params: { bookingId: booking._id }, user: { _id: booking.user } })
    assert.equal(result.statusCode, 200)
    assert.equal(booking.status, 'failed')
    assert.equal(booking.paymentFailureCode, 'provider_payment_failed')
    assert.equal(booking.paymentStatus, 'failed')
    assert.equal(releasedSeats, 1)
  })
})

test('paid confirmed bookings are not eligible for customer self-cancellation', async () => {
  const booking = { _id: '64b000000000000000000008', user: 'customer-a', status: 'confirmed', paymentStatus: 'paid' }
  let releaseCalled = false
  await withOverrides([{ model: Booking, methods: { async findOne() { return booking }, async findOneAndUpdate() { releaseCalled = true; return null } } }], async () => {
    const result = await invoke(cancelBooking, { params: { bookingId: booking._id }, user: { _id: booking.user } })
    assert.equal(result.error?.statusCode, 409)
    assert.match(result.error.message, /current Safar policy/i)
    assert.equal(releaseCalled, false)
  })
})

test('signed captured-payment webhook confirms once and safely acknowledges replay', async () => {
  const booking = {
    _id: 'booking-webhook', status: 'pending', paymentStatus: 'pending',
    razorpayOrderId: 'order-webhook', totalAmount: 250, expiresAt: new Date(Date.now() + 60000),
  }
  let updateCount = 0
  const rawBody = Buffer.from(JSON.stringify({
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay-webhook', order_id: 'order-webhook', amount: 25000, currency: 'INR', status: 'captured' } } },
  }))
  const signature = crypto.createHmac('sha256', process.env.RAZORPAY_TEST_WEBHOOK_SECRET).update(rawBody).digest('hex')
  await withOverrides([{ model: Booking, methods: {
    async findOne() { return { ...booking } },
    async findOneAndUpdate(filter, update) {
      if (booking.paymentStatus === 'paid') return null
      updateCount += 1
      Object.assign(booking, update.$set)
      return { ...booking }
    },
    async findById() { return { ...booking } },
  } }, { model: razorpay, methods: { orders: { ...razorpay.orders, async fetchPayments() { return { items: [] } } } } }], async () => {
    const req = {
      rawBody,
      body: JSON.parse(rawBody.toString()),
      get(name) { return name.toLowerCase() === 'x-razorpay-signature' ? signature : undefined },
    }
    assert.equal((await invoke(handlePaymentWebhook, req)).statusCode, 200)
    assert.equal((await invoke(handlePaymentWebhook, req)).statusCode, 200)
    assert.equal(updateCount, 1)
    assert.equal(booking.status, 'confirmed')
  })
})

test('signed definitive payment.failed webhook releases seats once and queues failure notification', async () => {
  const booking = { _id: 'booking-failed-webhook', user: 'customer-a', departure: 'departure-a', numberOfSeats: 2, status: 'pending', paymentStatus: 'pending', razorpayOrderId: 'order-failed-webhook', totalAmount: 500, seatsReleasedAt: null }
  let releasedSeats = 0
  const rawBody = Buffer.from(JSON.stringify({
    event: 'payment.failed',
    payload: { payment: { entity: { id: 'pay-failed-webhook', order_id: booking.razorpayOrderId, amount: 50000, currency: 'INR', status: 'failed' } } },
  }))
  const signature = crypto.createHmac('sha256', process.env.RAZORPAY_TEST_WEBHOOK_SECRET).update(rawBody).digest('hex')
  await withOverrides([
    { model: Booking, methods: {
      async findOne() { return booking },
      async findOneAndUpdate(filter, update) {
        if (filter.status?.$in && !filter.status.$in.includes(booking.status)) return null
        if (filter.seatsReleasedAt === null && booking.seatsReleasedAt !== null) return null
        Object.assign(booking, update.$set)
        return booking
      },
    } },
    { model: Departure, methods: { async updateOne(_filter, update) { releasedSeats += update.$inc.availableSeats; return { matchedCount: 1 } } } },
    { model: razorpay, methods: { orders: { ...razorpay.orders, async fetchPayments() { return { items: [{ status: 'failed' }] } } } } },
  ], async () => {
    const req = {
      rawBody,
      body: JSON.parse(rawBody.toString()),
      get(name) { return name.toLowerCase() === 'x-razorpay-signature' ? signature : name.toLowerCase() === 'x-razorpay-event-id' ? 'event-failed-1' : undefined },
    }
    assert.equal((await invoke(handlePaymentWebhook, req)).statusCode, 200)
    assert.equal(booking.status, 'failed')
    assert.equal(booking.paymentStatus, 'failed')
    assert.equal(releasedSeats, 2)
    assert.equal((await invoke(handlePaymentWebhook, req)).statusCode, 200)
    assert.equal(releasedSeats, 2)
  })
})

test('late payment.failed webhook cannot downgrade a confirmed booking', async () => {
  const booking = { _id: 'booking-paid-failure', status: 'confirmed', paymentStatus: 'paid', razorpayOrderId: 'order-paid-failure', razorpayPaymentId: 'pay-captured', totalAmount: 250 }
  const rawBody = Buffer.from(JSON.stringify({
    event: 'payment.failed',
    payload: { payment: { entity: { id: 'pay-old-failed', order_id: booking.razorpayOrderId, amount: 25000, currency: 'INR', status: 'failed' } } },
  }))
  const signature = crypto.createHmac('sha256', process.env.RAZORPAY_TEST_WEBHOOK_SECRET).update(rawBody).digest('hex')
  let releaseCalled = false
  await withOverrides([
    { model: Booking, methods: { async findOne() { return booking }, async findOneAndUpdate() { releaseCalled = true; return null } } },
    { model: Departure, methods: { async updateOne() { releaseCalled = true; return { matchedCount: 1 } } } },
  ], async () => {
    const result = await invoke(handlePaymentWebhook, {
      rawBody, body: JSON.parse(rawBody.toString()),
      get(name) { return name.toLowerCase() === 'x-razorpay-signature' ? signature : name.toLowerCase() === 'x-razorpay-event-id' ? 'event-old-failure' : undefined },
    })
    assert.equal(result.statusCode, 200)
    assert.equal(booking.status, 'confirmed')
    assert.equal(booking.paymentStatus, 'paid')
    assert.equal(releaseCalled, false)
  })
})

test('late captured payment after a released failed booking starts a refund without reviving tickets', async () => {
  const releasedAt = new Date(Date.now() - 1000)
  const booking = {
    _id: 'booking-late-capture', user: 'customer-a', departure: 'departure-a', numberOfSeats: 1,
    status: 'failed', paymentStatus: 'failed', razorpayOrderId: 'order-late-capture', totalAmount: 250,
    seatsReleasedAt: releasedAt, refundAttempt: 0, refundId: null, refundRequestedAt: null, refundRetryAfter: null,
  }
  const rawBody = Buffer.from(JSON.stringify({
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay-late-capture', order_id: booking.razorpayOrderId, amount: 25000, currency: 'INR', status: 'captured' } } },
  }))
  const signature = crypto.createHmac('sha256', process.env.RAZORPAY_TEST_WEBHOOK_SECRET).update(rawBody).digest('hex')
  let refundCalls = 0
  let seatReleaseCalls = 0
  await withOverrides([
    { model: Booking, methods: {
      async findOne() { return booking },
      async findOneAndUpdate(filter, update) {
        if (filter.status?.$in && !filter.status.$in.includes(booking.status)) return null
        if (typeof filter.status === 'string' && filter.status !== booking.status) return null
        if (typeof filter.paymentStatus === 'string' && filter.paymentStatus !== booking.paymentStatus) return null
        Object.assign(booking, update.$set || {})
        return booking
      },
      async findById() { return booking },
    } },
    { model: Departure, methods: { async updateOne() { seatReleaseCalls += 1; return { matchedCount: 1 } } } },
    { model: razorpay, methods: { payments: {
      ...razorpay.payments,
      async refund(paymentId, data) {
        refundCalls += 1
        return { id: 'refund-late-capture', payment_id: paymentId, amount: data.amount, status: 'pending' }
      },
    } } },
  ], async () => {
    const result = await invoke(handlePaymentWebhook, {
      rawBody, body: JSON.parse(rawBody.toString()),
      get(name) { return name.toLowerCase() === 'x-razorpay-signature' ? signature : name.toLowerCase() === 'x-razorpay-event-id' ? 'event-late-capture' : undefined },
    })
    assert.equal(result.statusCode, 200)
    assert.equal(booking.status, 'refund_pending')
    assert.equal(booking.paymentStatus, 'refund_pending')
    assert.equal(booking.razorpayPaymentId, 'pay-late-capture')
    assert.equal(booking.seatsReleasedAt, releasedAt)
    assert.equal(refundCalls, 1)
    assert.equal(seatReleaseCalls, 0)
  })
})

test('payment.failed webhook keeps seats reserved when another provider payment is unresolved', async () => {
  const booking = { _id: 'booking-pending-failure', status: 'pending', paymentStatus: 'pending', razorpayOrderId: 'order-pending-failure', totalAmount: 250 }
  const rawBody = Buffer.from(JSON.stringify({
    event: 'payment.failed',
    payload: { payment: { entity: { id: 'pay-failed-attempt', order_id: booking.razorpayOrderId, amount: 25000, currency: 'INR', status: 'failed' } } },
  }))
  const signature = crypto.createHmac('sha256', process.env.RAZORPAY_TEST_WEBHOOK_SECRET).update(rawBody).digest('hex')
  let releaseCalled = false
  await withOverrides([
    { model: Booking, methods: { async findOne() { return booking }, async findOneAndUpdate() { releaseCalled = true; return null } } },
    { model: Departure, methods: { async updateOne() { releaseCalled = true; return { matchedCount: 1 } } } },
    { model: razorpay, methods: { orders: { ...razorpay.orders, async fetchPayments() { return { items: [{ status: 'failed' }, { status: 'authorized' }] } } } } },
  ], async () => {
    const result = await invoke(handlePaymentWebhook, {
      rawBody, body: JSON.parse(rawBody.toString()),
      get(name) { return name.toLowerCase() === 'x-razorpay-signature' ? signature : undefined },
    })
    assert.equal(result.statusCode, 200)
    assert.equal(booking.status, 'pending')
    assert.equal(releaseCalled, false)
  })
})

test('admin cancellation of a paid booking records refund_pending until the provider completes it', async () => {
  const booking = {
    _id: '64b000000000000000000009', user: 'customer-a', trip: 'trip-a', status: 'confirmed', paymentStatus: 'paid',
    razorpayPaymentId: 'pay-admin', totalAmount: 250, refundId: null, refundRequestedAt: null,
  }
  await withOverrides([
    { model: Booking, methods: {
      async findById() { return booking },
      async findOneAndUpdate(filter, update) { Object.assign(booking, update.$set); return booking },
    } },
    { model: razorpay, methods: { payments: {
      ...razorpay.payments,
      async fetch(id) { return { id, amount: 25000, currency: 'INR', status: 'captured' } },
      async refund(id) { return { id: 'refund-admin', payment_id: id, amount: 25000, status: 'pending' } },
    } } },
  ], async () => {
    const result = await invoke(adminCancelBooking, {
      params: { bookingId: booking._id }, user: { _id: 'admin-a', role: 'admin' }, body: { reason: 'Departure cancelled by Safar' },
    })
    assert.equal(result.statusCode, 200)
    assert.equal(booking.status, 'refund_pending')
    assert.equal(booking.paymentStatus, 'refund_pending')
    assert.equal(booking.refundId, 'refund-admin')
    assert.equal(booking.refundAmount, 250)
    assert.equal(booking.cancellationReason, 'Departure cancelled by Safar')
    assert.equal(booking.seatsReleasedAt, undefined)
  })
})

test('admin can safely retry a provider-confirmed failed refund and repeated retry reconciles instead of creating another refund', async () => {
  const booking = {
    _id: '64b000000000000000000019', user: 'customer-refund', trip: 'trip-a', departure: 'departure-a',
    status: 'refund_pending', paymentStatus: 'refund_failed', razorpayPaymentId: 'pay-retry', refundId: 'refund-old',
    refundAmount: 250, totalAmount: 250, numberOfSeats: 1, refundAttempt: 0,
  }
  let refundCalls = 0
  await withOverrides([
    { model: Booking, methods: {
      async findById() { return booking },
      async findOneAndUpdate(filter, update) {
        if (filter.refundId === 'refund-old' && booking.refundId !== 'refund-old') return null
        if (filter.refundRequestedAt === null && booking.refundRequestedAt) return null
        if (filter.paymentStatus === 'refund_failed' && booking.paymentStatus !== 'refund_failed') return null
        Object.assign(booking, update.$set || {})
        if (update.$inc?.refundAttempt) booking.refundAttempt = (booking.refundAttempt || 0) + update.$inc.refundAttempt
        return booking
      },
    } },
    { model: razorpay, methods: { payments: {
      ...razorpay.payments,
      async fetch(id) { return { id, status: 'captured', amount: 25000, currency: 'INR' } },
      async fetchRefund(id, refundId) { return { id: refundId, payment_id: id, amount: 25000, status: refundId === 'refund-old' ? 'failed' : 'pending' } },
      async refund(id) { refundCalls += 1; return { id: 'refund-new', payment_id: id, amount: 25000, status: 'pending' } },
    } } },
  ], async () => {
    const req = { params: { bookingId: booking._id }, user: { _id: 'admin-id', role: 'admin' } }
    const first = await invoke(adminRetryRefund, req)
    assert.equal(first.statusCode, 202)
    assert.equal(booking.paymentStatus, 'refund_pending')
    assert.equal(booking.refundId, 'refund-new')
    assert.equal(refundCalls, 1)
    const retry = await invoke(adminRetryRefund, req)
    assert.equal(retry.statusCode, 202)
    assert.equal(refundCalls, 1)
  })
})

test('admin departure cancellation closes the departure and cancels unpaid reservations', async () => {
  const departure = { _id: '64b00000000000000000000c', status: 'scheduled' }
  const booking = { _id: '64b00000000000000000000d', user: 'customer-a', trip: 'trip-a', departure: departure._id, numberOfSeats: 1, status: 'pending', paymentStatus: 'pending' }
  let releasedSeats = 0
  await withOverrides([
    transactionOverride(),
    { model: Departure, methods: {
      async findOneAndUpdate(filter, update) { Object.assign(departure, update.$set); return departure },
      async updateOne(filter, update) { releasedSeats += update.$inc.availableSeats; return { matchedCount: 1 } },
    } },
    { model: Booking, methods: {
      find() { return Promise.resolve([booking]) },
      async findOne() { return booking },
      async findOneAndUpdate(filter, update) { Object.assign(booking, update.$set); return booking },
    } },
  ], async () => {
    const result = await invoke(adminCancelDeparture, { params: { departureId: departure._id }, user: { _id: 'admin-a' }, body: { reason: 'Weather disruption' } })
    assert.equal(result.statusCode, 200)
    assert.equal(departure.status, 'cancelled')
    assert.equal(departure.cancellationReason, 'Weather disruption')
    assert.equal(booking.status, 'cancelled')
    assert.equal(booking.cancellationReason, 'Weather disruption')
    assert.equal(releasedSeats, 1)
  })
})

test('verified refund webhook marks refunded and releases confirmed inventory once', async () => {
  const booking = {
    _id: '64b00000000000000000000a', departure: 'departure-refund', numberOfSeats: 2,
    totalAmount: 500, refundAmount: 500, refundId: 'refund-a', razorpayPaymentId: 'pay-refund',
    status: 'refund_pending', paymentStatus: 'refund_pending', seatsReleasedAt: null,
  }
  let releasedSeats = 0
  const rawBody = Buffer.from(JSON.stringify({
    event: 'refund.processed',
    payload: { refund: { entity: { id: 'refund-a', payment_id: 'pay-refund', amount: 50000 } } },
  }))
  const signature = crypto.createHmac('sha256', process.env.RAZORPAY_TEST_WEBHOOK_SECRET).update(rawBody).digest('hex')
  await withOverrides([
    transactionOverride(),
    { model: Booking, methods: {
      async findOne() { return booking },
      async findOneAndUpdate(filter, update) {
        if (filter.status?.$in && !filter.status.$in.includes(booking.status)) return null
        if (filter.seatsReleasedAt?.$ne === null && !booking.seatsReleasedAt) return null
        Object.assign(booking, update.$set)
        return booking
      },
    } },
    { model: Departure, methods: { async updateOne(filter, update) { releasedSeats += update.$inc.availableSeats; return { matchedCount: 1 } } } },
  ], async () => {
    const req = { rawBody, body: JSON.parse(rawBody.toString()), get(name) { return name.toLowerCase() === 'x-razorpay-signature' ? signature : undefined } }
    assert.equal((await invoke(handlePaymentWebhook, req)).statusCode, 200)
    assert.equal((await invoke(handlePaymentWebhook, req)).statusCode, 200)
    assert.equal(booking.status, 'refunded')
    assert.equal(booking.paymentStatus, 'refunded')
    assert.ok(booking.seatsReleasedAt)
    assert.equal(releasedSeats, 2)
  })
})


