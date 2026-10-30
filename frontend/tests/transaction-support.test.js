import assert from 'node:assert/strict'
import test from 'node:test'
import { detectTransactionSupport, requireTransactionSupport } from '../../src/utils/transaction-support.js'

function fakeConnection(hello) {
  return { db: { admin: () => ({ command: async () => hello }) } }
}

test('standalone MongoDB is detected and inventory operations fail closed', async () => {
  assert.equal(await detectTransactionSupport(fakeConnection({ isWritablePrimary: true })), false)
  assert.throws(requireTransactionSupport, (error) => error.statusCode === 503 && /replica set|sharded-cluster/i.test(error.message))
})

test('replica set and sharded MongoDB deployments permit transactional operations', async () => {
  assert.equal(await detectTransactionSupport(fakeConnection({ setName: 'safar-rs', isWritablePrimary: true })), true)
  assert.doesNotThrow(requireTransactionSupport)
  assert.equal(await detectTransactionSupport(fakeConnection({ msg: 'isdbgrid' })), true)
})
