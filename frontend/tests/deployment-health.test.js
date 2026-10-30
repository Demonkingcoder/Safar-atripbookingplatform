import assert from 'node:assert/strict'
import test from 'node:test'
import mongoose from 'mongoose'
import NotificationOutbox from '../../src/models/NotificationOutbox.js'
import NotificationWorkerHeartbeat from '../../src/models/NotificationWorkerHeartbeat.js'
import { detectTransactionSupport } from '../../src/utils/transaction-support.js'
import { healthCheck, workerHealthCheck } from '../../src/controllers/healthCheckController.js'

function invoke(handler) {
  return new Promise((resolve) => {
    const res = {
      statusCode: null,
      body: null,
      status(statusCode) { this.statusCode = statusCode; return this },
      json(body) { this.body = body; resolve(this); return this },
    }
    handler({}, res, (error) => resolve({ error }))
  })
}

test('API readiness fails closed unless the database and transaction capability are ready', async () => {
  const originalReadyState = mongoose.connection.readyState
  mongoose.connection.readyState = 0
  try {
    const result = await invoke(healthCheck)
    assert.equal(result.statusCode, 503)
    assert.equal(result.body.data.database, 'unavailable')
  } finally {
    mongoose.connection.readyState = originalReadyState
  }
})

test('worker probe reports the fresh Mongo heartbeat and detects dead-letter jobs', async () => {
  const originalReadyState = mongoose.connection.readyState
  const originalFind = NotificationWorkerHeartbeat.findById
  const originalCount = NotificationOutbox.countDocuments
  const now = new Date()
  mongoose.connection.readyState = 1
  await detectTransactionSupport({ db: { admin: () => ({ command: async () => ({ setName: 'rs0' }) }) } })
  let deadLetterJobs = 0
  const heartbeat = { state: 'healthy', lastHeartbeatAt: now, currentProcessingState: 'idle' }
  NotificationWorkerHeartbeat.findById = () => ({ lean: async () => heartbeat })
  NotificationOutbox.countDocuments = async () => deadLetterJobs
  try {
    assert.equal((await invoke(workerHealthCheck)).statusCode, 200)
    deadLetterJobs = 1
    const availableWithDeadLetters = await invoke(workerHealthCheck)
    assert.equal(availableWithDeadLetters.statusCode, 200)
    assert.equal(availableWithDeadLetters.body.data.worker.availability, 'available')
    assert.equal(availableWithDeadLetters.body.data.queue.deadLetterJobs, 1)
    heartbeat.state = 'degraded'
    const degradedButAlive = await invoke(workerHealthCheck)
    assert.equal(degradedButAlive.body.data.worker.liveness, 'alive')
    assert.equal(degradedButAlive.body.data.worker.availability, 'unavailable')
    heartbeat.state = 'healthy'
    heartbeat.currentProcessingState = 'processing'
    heartbeat.currentJobId = 'stalled-job'
    heartbeat.currentJobStartedAt = new Date(Date.now() - 6 * 60 * 1000)
    const stalled = await invoke(workerHealthCheck)
    assert.equal(stalled.statusCode, 503)
    assert.equal(stalled.body.data.processing.state, 'stalled')
  } finally {
    mongoose.connection.readyState = originalReadyState
    NotificationWorkerHeartbeat.findById = originalFind
    NotificationOutbox.countDocuments = originalCount
  }
})
