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
  NotificationWorkerHeartbeat.findById = () => ({ lean: async () => ({ state: 'healthy', lastHeartbeatAt: now }) })
  NotificationOutbox.countDocuments = async () => deadLetterJobs
  try {
    assert.equal((await invoke(workerHealthCheck)).statusCode, 200)
    deadLetterJobs = 1
    const degraded = await invoke(workerHealthCheck)
    assert.equal(degraded.statusCode, 503)
    assert.equal(degraded.body.data.deadLetterJobs, 1)
  } finally {
    mongoose.connection.readyState = originalReadyState
    NotificationWorkerHeartbeat.findById = originalFind
    NotificationOutbox.countDocuments = originalCount
  }
})
