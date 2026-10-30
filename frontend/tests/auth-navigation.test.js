import assert from 'node:assert/strict'
import test from 'node:test'
import { getAuthenticatedLandingPath } from '../src/utils/authNavigation.js'

test('customers return to the homepage and admins retain the existing root landing route', () => {
  assert.equal(getAuthenticatedLandingPath({ role: 'customer' }), '/')
  assert.equal(getAuthenticatedLandingPath({ role: 'admin' }), '/')
})
