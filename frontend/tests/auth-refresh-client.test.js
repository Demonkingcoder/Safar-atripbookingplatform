import assert from 'node:assert/strict'
import test from 'node:test'
import { canRefreshRequest, createRefreshCoordinator } from '../src/services/authRefresh.js'

test('simultaneous failed requests share a single refresh operation', async () => {
  let refreshCount = 0
  let finishRefresh
  const refreshOnce = createRefreshCoordinator(() => {
    refreshCount += 1
    return new Promise((resolve) => { finishRefresh = resolve })
  })

  const requests = [refreshOnce(), refreshOnce(), refreshOnce()]
  await Promise.resolve()
  assert.equal(refreshCount, 1)
  finishRefresh({ ok: true })
  const results = await Promise.all(requests)
  assert.equal(results.length, 3)
  assert.equal(refreshCount, 1)
})

test('refresh failure is shared, clears state once, and does not loop on the refresh request', async () => {
  let refreshCount = 0
  let failureCount = 0
  const refreshOnce = createRefreshCoordinator(async () => {
    refreshCount += 1
    throw new Error('refresh rejected')
  }, () => { failureCount += 1 })
  const results = await Promise.allSettled([refreshOnce(), refreshOnce()])
  assert.equal(results.filter((result) => result.status === 'rejected').length, 2)
  assert.equal(refreshCount, 1)
  assert.equal(failureCount, 1)
})

test('only eligible 401 responses retry once through refresh', () => {
  assert.equal(canRefreshRequest({ response: { status: 401 }, config: { url: '/bookings/my-bookings' } }), true)
  assert.equal(canRefreshRequest({ response: { status: 403 }, config: { url: '/bookings/my-bookings' } }), false)
  assert.equal(canRefreshRequest({ response: { status: 500 }, config: { url: '/bookings/my-bookings' } }), false)
  assert.equal(canRefreshRequest({ response: { status: 401 }, config: { url: '/auth/login' } }), false)
  assert.equal(canRefreshRequest({ response: { status: 401 }, config: { url: '/auth/refresh-token' } }), false)
  assert.equal(canRefreshRequest({ response: { status: 401 }, config: { url: '/bookings/my-bookings', _safarRetried: true } }), false)
  assert.equal(canRefreshRequest({ response: { status: 401 }, config: { url: '/bookings/my-bookings', _skipAuthRefresh: true } }), false)
})
