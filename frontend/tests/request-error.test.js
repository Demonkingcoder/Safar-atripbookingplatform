import assert from 'node:assert/strict'
import test from 'node:test'
import { errorHandler } from '../../src/middlewares/error.middleware.js'
import { requestIdMiddleware } from '../../src/middlewares/request-id.middleware.js'

function invokeError(err, req) {
  return new Promise((resolve) => {
    const response = {
      statusCode: null,
      status(code) { this.statusCode = code; return this },
      json(body) { resolve({ statusCode: this.statusCode, body }); return this },
    }
    errorHandler(err, req, response, () => {})
  })
}

test('request middleware assigns a server-generated ID and response header', () => {
  const req = {}
  const headers = {}
  let continued = false
  requestIdMiddleware(req, { setHeader(name, value) { headers[name] = value } }, () => { continued = true })
  assert.match(req.requestId, /^[0-9a-f-]{36}$/i)
  assert.equal(headers['X-Request-Id'], req.requestId)
  assert.equal(continued, true)
})

test('production server errors return only a generic message and request ID, with sanitized logs', async () => {
  const originalMode = process.env.NODE_ENV
  const originalConsoleError = console.error
  const logs = []
  process.env.NODE_ENV = 'production'
  console.error = (...args) => logs.push(args.join(' '))
  try {
    const result = await invokeError(Object.assign(new Error('Mongo URI and private customer data'), { code: 11000 }), {
      requestId: 'req-safe-id', method: 'POST', route: { path: '/api/v1/bookings' },
    })
    assert.equal(result.statusCode, 500)
    assert.equal(result.body.message, 'Internal Server Error')
    assert.equal(result.body.requestId, 'req-safe-id')
    assert.deepEqual(result.body.errors, [])
    assert.equal(JSON.stringify(result.body).includes('private customer data'), false)
    assert.equal(logs.length, 1)
    assert.match(logs[0], /req-safe-id/)
    assert.match(logs[0], /11000/)
    assert.equal(logs[0].includes('private customer data'), false)
  } finally {
    console.error = originalConsoleError
    if (originalMode === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = originalMode
  }
})

test('development errors retain detail and stack for local diagnosis', async () => {
  const originalMode = process.env.NODE_ENV
  process.env.NODE_ENV = 'development'
  try {
    const result = await invokeError(Object.assign(new Error('Local diagnostic'), { statusCode: 500 }), {
      requestId: 'req-dev-id', method: 'GET', route: { path: '/test' },
    })
    assert.equal(result.body.message, 'Local diagnostic')
    assert.equal(result.body.requestId, 'req-dev-id')
    assert.match(result.body.stack, /Local diagnostic/)
  } finally {
    if (originalMode === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = originalMode
  }
})
