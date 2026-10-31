import assert from 'node:assert/strict'
import test from 'node:test'
import { pollPaymentStatus } from '../src/utils/paymentStatusPolling.js'

test('payment status refresh stops once the backend confirms both booking and payment', async () => {
  const responses = [
    { booking: { status: 'pending', paymentStatus: 'pending' }, paymentStatus: 'pending' },
    { booking: { status: 'confirmed', paymentStatus: 'paid' }, paymentStatus: 'paid' },
  ]
  let calls = 0
  const result = await pollPaymentStatus(async () => responses[calls++], 'booking-1', { attempts: 4, wait: async () => {} })
  assert.equal(calls, 2)
  assert.equal(result.settled, true)
  assert.equal(result.result.booking.status, 'confirmed')
})

test('pending payment refresh is bounded and does not call a pending booking successful', async () => {
  let calls = 0
  const result = await pollPaymentStatus(async () => {
    calls += 1
    return { booking: { status: 'pending', paymentStatus: 'pending' }, paymentStatus: 'pending' }
  }, 'booking-2', { attempts: 3, wait: async () => {} })
  assert.equal(calls, 3)
  assert.equal(result.settled, false)
})
