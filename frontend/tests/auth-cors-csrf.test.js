import assert from 'node:assert/strict'
import test from 'node:test'

process.env.CORS_ORIGIN = 'http://localhost:5173'
process.env.RAZORPAY_MODE = 'test'
process.env.RAZORPAY_TEST_KEY_ID = 'rzp_test_placeholder'
process.env.RAZORPAY_TEST_KEY_SECRET = 'test-secret'
process.env.ACCESS_TOKEN_SECRET = 'access-test-secret'
process.env.REFRESH_TOKEN_SECRET = 'refresh-test-secret'

const { default: app } = await import('../../src/app.js')

test('credentialed CORS allows configured frontend origin and rejects an unconfigured one', async (t) => {
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())))
  const baseUrl = `http://127.0.0.1:${server.address().port}`

  const allowedPreflight = await fetch(`${baseUrl}/api/v1/auth/refresh-token`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:5173',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  })
  assert.equal(allowedPreflight.headers.get('access-control-allow-origin'), 'http://localhost:5173')
  assert.equal(allowedPreflight.headers.get('access-control-allow-credentials'), 'true')

  const deniedPreflight = await fetch(`${baseUrl}/api/v1/auth/refresh-token`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://attacker.example',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  })
  assert.equal(deniedPreflight.headers.get('access-control-allow-origin'), null)

  const deniedRequest = await fetch(`${baseUrl}/api/v1/auth/refresh-token`, {
    method: 'POST',
    headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' },
    body: '{}',
  })
  assert.equal(deniedRequest.status, 403)
  assert.equal(deniedRequest.headers.get('access-control-allow-origin'), null)
})
