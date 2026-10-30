import assert from 'node:assert/strict'
import test from 'node:test'
import Booking from '../../src/models/Booking.js'
import Departure from '../../src/models/Departure.js'
import Trip from '../../src/models/Trip.js'
import { verifyJWT } from '../../src/middlewares/auth.middleware.js'

process.env.RAZORPAY_MODE = 'test'
process.env.RAZORPAY_TEST_KEY_ID = 'rzp_test_placeholder'
process.env.RAZORPAY_TEST_KEY_SECRET = 'test-secret'
const { getMyBookings } = await import('../../src/controllers/bookingController.js')
const { getTripDepartures } = await import('../../src/controllers/departureController.js')

function invoke(handler, req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: null,
      status(statusCode) {
        this.statusCode = statusCode
        return this
      },
      json(body) {
        resolve({ statusCode: this.statusCode, body })
        return this
      },
    }
    handler(req, res, (error) => resolve({ error }))
  })
}

async function withMethodOverrides(overrides, run) {
  const originals = overrides.map(({ model, methods }) => ({
    model,
    methods: Object.fromEntries(Object.keys(methods).map((method) => [method, model[method]])),
  }))
  for (const { model, methods } of overrides) Object.assign(model, methods)
  try {
    await run()
  } finally {
    for (const { model, methods } of originals) Object.assign(model, methods)
  }
}

function bookingQuery(bookings) {
  const query = {
    populate() { return this },
    sort() { return this },
    async lean() { return bookings },
  }
  return query
}

function departureQuery(departures) {
  const query = {
    select() { return this },
    sort() { return this },
    async lean() { return departures },
  }
  return query
}

test('authenticated bookings are scoped to the session user and include only that user’s results', async () => {
  let capturedFilter
  const ownBooking = { _id: 'booking-1', user: 'customer-a' }
  await withMethodOverrides([
    { model: Booking, methods: { find(filter) { capturedFilter = filter; return bookingQuery([ownBooking]) } } },
  ], async () => {
    const result = await invoke(getMyBookings, {
      user: { _id: 'customer-a' },
      query: { userId: 'customer-b' },
    })
    assert.equal(result.statusCode, 200)
    assert.deepEqual(capturedFilter, { user: 'customer-a' })
    assert.deepEqual(result.body.data.bookings, [ownBooking])
  })
})

test('authenticated customers with no bookings receive a successful empty array', async () => {
  await withMethodOverrides([
    { model: Booking, methods: { find() { return bookingQuery([]) } } },
  ], async () => {
    const result = await invoke(getMyBookings, { user: { _id: 'customer-empty' } })
    assert.equal(result.statusCode, 200)
    assert.deepEqual(result.body.data.bookings, [])
  })
})

test('booking authentication rejects requests without a session token', async () => {
  const result = await invoke(verifyJWT, {
    cookies: {},
    header() { return undefined },
  })
  assert.equal(result.error?.statusCode, 401)
})

test('valid trip slugs return their scheduled departures', async () => {
  const trip = { _id: 'trip-db-id' }
  const departure = { _id: 'departure-1', trip: trip._id, price: 125, availableSeats: 4 }
  let tripFilter
  let departureFilter
  await withMethodOverrides([
    { model: Trip, methods: { findOne(filter) { tripFilter = filter; return { select: async () => trip } } } },
    { model: Departure, methods: { find(filter) { departureFilter = filter; return departureQuery([departure]) } } },
  ], async () => {
    const result = await invoke(getTripDepartures, { params: { slug: 'ladakh-escape' } })
    assert.equal(result.statusCode, 200)
    assert.deepEqual(tripFilter, { slug: 'ladakh-escape', status: 'published' })
    assert.equal(departureFilter.trip, trip._id)
    assert.deepEqual(result.body.data.departures, [departure])
  })
})

test('valid trips with no scheduled departures return an empty array', async () => {
  await withMethodOverrides([
    { model: Trip, methods: { findOne() { return { select: async () => ({ _id: 'trip-db-id' }) } } } },
    { model: Departure, methods: { find() { return departureQuery([]) } } },
  ], async () => {
    const result = await invoke(getTripDepartures, { params: { slug: 'quiet-season' } })
    assert.equal(result.statusCode, 200)
    assert.deepEqual(result.body.data.departures, [])
  })
})

test('unknown trip slugs return 404 without querying departures', async () => {
  let departureQueryCalled = false
  await withMethodOverrides([
    { model: Trip, methods: { findOne() { return { select: async () => null } } } },
    { model: Departure, methods: { find() { departureQueryCalled = true; return departureQuery([]) } } },
  ], async () => {
    const result = await invoke(getTripDepartures, { params: { slug: 'missing-trip' } })
    assert.equal(result.error?.statusCode, 404)
    assert.equal(departureQueryCalled, false)
  })
})
