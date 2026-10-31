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

test('separate tabs serialize refreshes through the shared browser lock', async () => {
  let refreshCount = 0
  let activeRefreshes = 0
  let maxActiveRefreshes = 0
  let releaseRefresh
  let lockTail = Promise.resolve()
  const locks = {
    async request(_name, _options, callback) {
      const previous = lockTail
      let releaseLock
      lockTail = new Promise((resolve) => { releaseLock = resolve })
      await previous
      try { return await callback() } finally { releaseLock() }
    },
  }
  const refresh = async () => {
    refreshCount += 1
    activeRefreshes += 1
    maxActiveRefreshes = Math.max(maxActiveRefreshes, activeRefreshes)
    await new Promise((resolve) => { releaseRefresh = resolve })
    activeRefreshes -= 1
    return { ok: true }
  }
  const tabOne = createRefreshCoordinator(refresh, null, { locks })
  const tabTwo = createRefreshCoordinator(refresh, null, { locks })
  const first = tabOne()
  const second = tabTwo()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(refreshCount, 1)
  assert.equal(maxActiveRefreshes, 1)
  releaseRefresh()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(refreshCount, 2)
  releaseRefresh()
  await Promise.all([first, second])
  assert.equal(maxActiveRefreshes, 1)
})

test('refresh falls back to the server-side race protection when Web Locks are unavailable', async () => {
  let refreshCount = 0
  const refreshOnce = createRefreshCoordinator(async () => { refreshCount += 1 }, null, { locks: null })
  await refreshOnce()
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
