import assert from 'node:assert/strict'
import test from 'node:test'
import { requireAdmin } from '../../src/middlewares/requireAdmin.middleware.js'

test('admin cancellation authorization rejects customers and allows database-authenticated admins', () => {
  const invoke = (role) => new Promise((resolve) => {
    requireAdmin({ user: { role } }, {}, (error) => resolve(error))
  })
  return Promise.all([invoke('customer'), invoke('admin')]).then(([customerError, adminError]) => {
    assert.equal(customerError?.statusCode, 403)
    assert.equal(adminError, undefined)
  })
})
