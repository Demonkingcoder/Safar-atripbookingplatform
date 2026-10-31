import assert from 'node:assert/strict'
import test from 'node:test'
import Trip from '../../src/models/Trip.js'
import Departure from '../../src/models/Departure.js'

const { getAllTrips } = await import('../../src/controllers/tripController.js')

function invoke(handler, req = {}) {
  return new Promise((resolve) => {
    const res = { statusCode: null, status(code) { this.statusCode = code; return this }, json(body) { resolve({ statusCode: this.statusCode, body }); return this } }
    handler(req, res, (error) => resolve({ error }))
  })
}

function query(value) {
  return { select() { return this }, sort() { return this }, async lean() { return value } }
}

async function withOverrides(overrides, run) {
  const originals = overrides.map(({ model, methods }) => ({ model, methods: Object.fromEntries(Object.keys(methods).map((name) => [name, model[name]])) }))
  for (const { model, methods } of overrides) Object.assign(model, methods)
  try { await run() } finally { for (const { model, methods } of originals) Object.assign(model, methods) }
}

test('trip listing uses the lowest future scheduled departure with seats and marks base price fallback', async () => {
  const trips = [
    { _id: 'trip-with-departures', basePrice: 1000, status: 'published' },
    { _id: 'trip-without-departures', basePrice: 2200, status: 'published' },
  ]
  let departureFilter
  let departureSort
  await withOverrides([
    { model: Trip, methods: { find: () => query(trips) } },
    { model: Departure, methods: { find(filter) {
      departureFilter = filter
      const prices = [
        { trip: trips[0]._id, price: 7500, startDate: new Date(Date.now() + 86400000) },
        { trip: trips[0]._id, price: 6900, startDate: new Date(Date.now() + 172800000) },
      ]
      return { select() { return this }, sort(sort) { departureSort = sort; prices.sort((a, b) => a.price - b.price); return this }, async lean() { return prices } }
    } } },
  ], async () => {
    const result = await invoke(getAllTrips)
    assert.equal(result.statusCode, 200)
    assert.deepEqual(departureFilter.trip.$in, trips.map(({ _id }) => _id))
    assert.equal(departureFilter.status, 'scheduled')
    assert.ok(departureFilter.startDate.$gt instanceof Date)
    assert.deepEqual(departureSort, { price: 1 })
    assert.deepEqual(result.body.data.trips.map(({ startingPrice, startingPriceSource, startingDepartureDate }) => ({ startingPrice, startingPriceSource, startingDepartureDate: startingDepartureDate ? true : null })), [
      { startingPrice: 6900, startingPriceSource: 'departure', startingDepartureDate: true },
      { startingPrice: 2200, startingPriceSource: 'basePrice', startingDepartureDate: null },
    ])
  })
})
