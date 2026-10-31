import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import User from '../../src/models/User.js'
import { login, resendVerificationEmail, verifyEmail } from '../../src/controllers/authController.js'

function invoke(handler, req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: null,
      status(statusCode) {
        this.statusCode = statusCode
        return this
      },
      json(body) {
        resolve({ statusCode: this.statusCode, body })
        return this
      },
    }

    handler(req, res, (error) => resolve({ error }))
  })
}

async function withFindOne(mockFindOne, run) {
  const originalFindOne = User.findOne
  User.findOne = mockFindOne
  try {
    await run()
  } finally {
    User.findOne = originalFindOne
  }
}

test('valid token verifies the matched user and saves the consumed token state', async () => {
  const token = 'test-verification-token'
  let capturedQuery
  let saveCalls = 0
  const user = {
    isEmailVerified: false,
    emailVerificationToken: 'stored-hash',
    emailVerificationExpiry: new Date(Date.now() + 60_000),
    async save(options) {
      saveCalls += 1
      assert.deepEqual(options, { validateBeforeSave: false })
    },
  }

  await withFindOne(async (query) => {
    capturedQuery = query
    return user
  }, async () => {
    const result = await invoke(verifyEmail, { params: { token } })

    assert.equal(result.statusCode, 200)
    assert.equal(user.isEmailVerified, true)
    assert.equal(user.emailVerificationToken, null)
    assert.equal(user.emailVerificationExpiry, null)
    assert.equal(saveCalls, 1)
  })

  assert.equal(
    capturedQuery.emailVerificationToken,
    createHash('sha256').update(token).digest('hex'),
  )
  assert.ok(capturedQuery.emailVerificationExpiry.$gt instanceof Date)
})

test('missing token is rejected without querying or saving a user', async () => {
  let queryCalls = 0

  await withFindOne(async () => {
    queryCalls += 1
    return null
  }, async () => {
    const result = await invoke(verifyEmail, { params: {} })
    assert.equal(result.error?.statusCode, 400)
    assert.equal(queryCalls, 0)
  })
})

test('login only exposes the unverified-email response after the password is valid', async () => {
  const user = {
    isActive: true,
    isEmailVerified: false,
    async isPasswordCorrect(password) {
      return password === 'correct-password'
    },
  }

  await withFindOne(async (query) => {
    assert.equal(query.email, 'traveler@example.test')
    return user
  }, async () => {
    const invalidPasswordResult = await invoke(login, {
      body: { email: 'Traveler@Example.Test', password: 'wrong-password' },
    })
    assert.equal(invalidPasswordResult.error?.statusCode, 401)
    assert.equal(invalidPasswordResult.error?.message, 'Invalid email or password')

    const unverifiedResult = await invoke(login, {
      body: { email: 'Traveler@Example.Test', password: 'correct-password' },
    })
    assert.equal(unverifiedResult.error?.statusCode, 403)
    assert.equal(unverifiedResult.error?.message, 'Please verify your email before logging in')
  })
})

test('invalid, expired, replayed, and deleted-user tokens do not save a user', async () => {
  const cases = [
    {
      label: 'invalid',
      token: 'invalid-token',
      storedToken: 'some-other-hash',
      expiry: new Date(Date.now() + 60_000),
    },
    {
      label: 'expired',
      token: 'expired-token',
      storedToken: createHash('sha256').update('expired-token').digest('hex'),
      expiry: new Date(Date.now() - 60_000),
    },
    { label: 'replayed', token: 'consumed-token', storedToken: null, expiry: null },
    { label: 'deleted-user', token: 'deleted-user-token', userMissing: true },
  ]

  for (const testCase of cases) {
    let saveCalls = 0
    const user = testCase.userMissing ? null : {
      emailVerificationToken: testCase.storedToken,
      emailVerificationExpiry: testCase.expiry,
      async save() { saveCalls += 1 },
    }

    await withFindOne(async (query) => {
      if (!user || query.emailVerificationToken !== user.emailVerificationToken) return null
      if (!(user.emailVerificationExpiry > query.emailVerificationExpiry.$gt)) return null
      return user
    }, async () => {
      const result = await invoke(verifyEmail, { params: { token: testCase.token } })
      assert.equal(result.error?.statusCode, 400, testCase.label)
      assert.match(result.error.message, /invalid or expired/i, testCase.label)
      assert.equal(saveCalls, 0, testCase.label)
    })
  }
})

test('resend for an already verified account returns the generic response without sending', async () => {
  let saveCalls = 0
  const user = {
    isEmailVerified: true,
    async save() { saveCalls += 1 },
  }

  await withFindOne(async () => user, async () => {
    const result = await invoke(resendVerificationEmail, {
      body: { email: 'verified@example.test' },
    })
    assert.equal(result.statusCode, 200)
    assert.match(result.body.message, /if the account exists and needs verification/i)
    assert.equal(saveCalls, 0)
  })
})

test('resend preserves the stored verification token when email configuration is unavailable', async () => {
  assert.equal(process.env.BREVO_SENDER_EMAIL, undefined, 'test must not be able to send real email')

  let saveCalls = 0
  const user = {
    email: 'traveler@example.test',
    fullName: 'Test Traveler',
    isEmailVerified: false,
    emailVerificationToken: 'old-hash',
    emailVerificationExpiry: new Date(0),
    async save(options) {
      saveCalls += 1
      assert.deepEqual(options, { validateBeforeSave: false })
    },
  }
  const originalConsoleError = console.error
  const logs = []
  console.error = (...args) => logs.push(args.join(' '))

  try {
    await withFindOne(async (query) => {
      assert.equal(query.email, 'traveler@example.test')
      return user
    }, async () => {
      const result = await invoke(resendVerificationEmail, {
        body: { email: 'Traveler@Example.Test' },
        requestId: 'resend-config-request-id',
      })

      assert.equal(result.error?.statusCode, 503)
      assert.match(result.error.message, /unable to send verification email/i)
      assert.equal(user.emailVerificationToken, 'old-hash')
      assert.equal(user.emailVerificationExpiry.getTime(), 0)
      assert.equal(saveCalls, 0)
    })
    assert.match(logs.join('\n'), /resend-config-request-id/)
    assert.doesNotMatch(logs.join('\n'), /not configured|traveler@example\.test/i)
  } finally {
    console.error = originalConsoleError
  }
})
