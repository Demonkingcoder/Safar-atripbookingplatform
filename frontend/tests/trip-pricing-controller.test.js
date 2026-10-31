import assert from 'node:assert/strict'
import test from 'node:test'
import Trip from '../../src/models/Trip.js'

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

test('trip listing always exposes Trip.basePrice as the customer payable price', async () => {
  const trips = [
    { _id: 'trip-with-departures', basePrice: 1000, status: 'published' },
    { _id: 'trip-without-departures', basePrice: 2200, status: 'published' },
  ]
  await withOverrides([
    { model: Trip, methods: { find: () => query(trips) } },
  ], async () => {
    const result = await invoke(getAllTrips)
    assert.equal(result.statusCode, 200)
    assert.deepEqual(result.body.data.trips.map(({ startingPrice, startingPriceSource, startingDepartureDate }) => ({ startingPrice, startingPriceSource, startingDepartureDate: startingDepartureDate ? true : null })), [
      { startingPrice: 1000, startingPriceSource: 'basePrice', startingDepartureDate: null },
      { startingPrice: 2200, startingPriceSource: 'basePrice', startingDepartureDate: null },
    ])
  })
})
