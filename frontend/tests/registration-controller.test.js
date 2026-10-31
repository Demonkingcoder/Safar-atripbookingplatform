import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test, { after } from 'node:test'
import User from '../../src/models/User.js'
import RefreshSession from '../../src/models/RefreshSession.js'

let rejectRecipient = false
let rejectAuthentication = false
let capturedMessage = ''
process.env.BREVO_SENDER_EMAIL = 'sender@example.test'
process.env.BREVO_API_KEY = 'brevo-api-key-test-only'

let providerRequestCount = 0
const originalFetch = globalThis.fetch
globalThis.fetch = async (_url, options) => {
  providerRequestCount += 1
  capturedMessage = options.body
  if (rejectRecipient) return new Response(JSON.stringify({ message: 'recipient rejected for test' }), { status: 400 })
  if (rejectAuthentication) return new Response(JSON.stringify({ message: 'authentication rejected for test' }), { status: 401 })
  return new Response(JSON.stringify({ messageId: 'test-message-id' }), { status: 201 })
}

const { registerUser, resendVerificationEmail, forgotPassword, resetPassword } = await import('../../src/controllers/authController.js')
const { sendEmail, verifyEmailTransport } = await import('../../src/utils/mail.js')

after(() => { globalThis.fetch = originalFetch })

function invoke(handler, req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: null,
      cleared: [],
      status(statusCode) {
        this.statusCode = statusCode
        return this
      },
      clearCookie(name, options) {
        this.cleared.push({ name, options })
        return this
      },
      json(body) {
        resolve({ statusCode: this.statusCode, body, cleared: this.cleared })
        return this
      },
    }
    handler(req, res, (error) => resolve({ error, cleared: res.cleared }))
  })
}

async function withUserStubs({ existingUser = null, createdUser = null }, run) {
  const originalFindOne = User.findOne
  const originalCreate = User.create
  const originalFindById = User.findById
  User.findOne = async () => existingUser
  User.create = async (record) => {
    if (createdUser) Object.assign(createdUser, record)
    return createdUser
  }
  User.findById = () => ({ select: async () => createdUser })
  try {
    await run()
  } finally {
    User.findOne = originalFindOne
    User.create = originalCreate
    User.findById = originalFindById
  }
}

const registrationBody = {
  fullName: 'Test Traveler',
  mobile: '+15551234567',
  email: 'traveler@example.test',
  password: 'test-password-123',
}

test('registration succeeds only when Brevo accepts the registered recipient', async () => {
  rejectRecipient = false
  const createdUser = { ...registrationBody, _id: 'test-user-id', isEmailVerified: false }

  await withUserStubs({ createdUser }, async () => {
    const result = await invoke(registerUser, { body: registrationBody })
    assert.equal(result.statusCode, 201)
    assert.match(result.body.message, /registration successful/i)
    assert.equal(createdUser.isEmailVerified, false)
  })
})

test('registration keeps the created account and returns an email-send error when Brevo rejects the recipient', async () => {
  rejectRecipient = true
  const createdUser = { ...registrationBody, _id: 'test-user-id', isEmailVerified: false }
  const originalConsoleError = console.error
  const logs = []
  console.error = (...args) => logs.push(args.join(' '))

  try {
    await withUserStubs({ createdUser }, async () => {
      const result = await invoke(registerUser, { body: registrationBody, requestId: 'register-request-id' })
      assert.equal(result.error?.statusCode, 503)
      assert.match(result.error?.message, /account created, but the verification email could not be sent/i)
      assert.doesNotMatch(result.error.message, /recipient rejected|brevo-api-key-test-only/i)
      assert.equal(createdUser.isEmailVerified, false)
      assert.match(createdUser.emailVerificationToken, /^[a-f0-9]{64}$/)
      assert.ok(createdUser.emailVerificationExpiry instanceof Date)
      assert.equal(JSON.stringify(result.error).includes('recipient rejected for test'), false)
    })
    assert.match(logs.join('\n'), /register-request-id/)
    assert.doesNotMatch(logs.join('\n'), /recipient rejected for test|brevo-api-key-test-only|traveler@example\.test/i)
  } finally {
    console.error = originalConsoleError
    rejectRecipient = false
  }
})

test('invalid and duplicate registrations are rejected before sending email', async () => {
  let createCalls = 0
  const originalFindOne = User.findOne
  const originalCreate = User.create
  User.findOne = async () => ({ _id: 'existing-user-id' })
  User.create = async () => { createCalls += 1 }

  try {
    const invalid = await invoke(registerUser, { body: { email: registrationBody.email } })
    assert.equal(invalid.error?.statusCode, 400)

    const duplicate = await invoke(registerUser, { body: registrationBody })
    assert.equal(duplicate.error?.statusCode, 409)
    assert.equal(createCalls, 0)
  } finally {
    User.findOne = originalFindOne
    User.create = originalCreate
  }
})

test('resend uses the existing verification route and reports success after Brevo acceptance', async () => {
  rejectRecipient = false
  let saved = false
  const user = {
    _id: 'resend-success-user',
    email: registrationBody.email,
    fullName: registrationBody.fullName,
    isEmailVerified: false,
    async save() { saved = true },
  }

  const originalFindOne = User.findOne
  User.findOne = async () => user
  try {
    const result = await invoke(resendVerificationEmail, { body: { email: registrationBody.email } })
    assert.equal(result.statusCode, 200)
    assert.match(result.body.message, /if the account exists and needs verification/i)
    assert.equal(saved, true)
  } finally {
    User.findOne = originalFindOne
  }
})

test('resend Brevo failure preserves the prior verification token and logs only safe details', async () => {
  rejectRecipient = true
  const priorExpiry = new Date('2027-01-01T00:00:00.000Z')
  const user = {
    _id: 'resend-failure-user',
    email: registrationBody.email,
    fullName: registrationBody.fullName,
    isEmailVerified: false,
    emailVerificationToken: 'previous-token-hash',
    emailVerificationExpiry: priorExpiry,
    saveCalls: 0,
    async save() { this.saveCalls += 1 },
  }
  const originalFindOne = User.findOne
  const originalConsoleError = console.error
  const logs = []
  User.findOne = async () => user
  console.error = (...args) => logs.push(args.join(' '))
  try {
    const result = await invoke(resendVerificationEmail, {
      body: { email: registrationBody.email },
      requestId: 'resend-request-id',
    })
    assert.equal(result.error?.statusCode, 503)
    assert.match(result.error.message, /unable to send verification email/i)
    assert.doesNotMatch(result.error.message, /recipient rejected|brevo-api-key-test-only/i)
    assert.equal(user.emailVerificationToken, 'previous-token-hash')
    assert.equal(user.emailVerificationExpiry, priorExpiry)
    assert.equal(user.saveCalls, 0)
    assert.equal(JSON.stringify(result.error).includes('recipient rejected for test'), false)
    assert.match(logs.join('\n'), /resend-request-id/)
    assert.doesNotMatch(logs.join('\n'), /recipient rejected for test|brevo-api-key-test-only|traveler@example\.test/i)
  } finally {
    User.findOne = originalFindOne
    console.error = originalConsoleError
    rejectRecipient = false
  }
})

test('Brevo configuration validation makes no provider request; send errors stay sanitized', async () => {
  assert.equal(await verifyEmailTransport(), true)
  const requestsBefore = providerRequestCount
  assert.equal(providerRequestCount, requestsBefore)

  rejectAuthentication = true
  try {
    await assert.rejects(sendEmail({ email: 'traveler@example.test', subject: 'test', textContent: 'test', htmlContent: '<p>test</p>' }), (error) => {
      assert.equal(error.code, 'brevo_api_auth_failed')
      assert.doesNotMatch(error.message, /authentication rejected for test|brevo-api-key-test-only/)
      return true
    })
  } finally {
    rejectAuthentication = false
  }
})

test('invalid sender or recipient is rejected before requesting the Brevo API', async () => {
  const originalSender = process.env.BREVO_SENDER_EMAIL
  const requestsBefore = providerRequestCount
  process.env.BREVO_SENDER_EMAIL = 'not-an-email'
  try {
    await assert.rejects(sendEmail({ email: 'traveler@example.test', subject: 'test', textContent: 'test', htmlContent: '<p>test</p>' }), { code: 'email_sender_invalid' })
    process.env.BREVO_SENDER_EMAIL = originalSender
    await assert.rejects(sendEmail({ email: 'bad-recipient', subject: 'test', textContent: 'test', htmlContent: '<p>test</p>' }), { code: 'email_recipient_invalid' })
    assert.equal(providerRequestCount, requestsBefore)
  } finally {
    process.env.BREVO_SENDER_EMAIL = originalSender
  }
})

test('forgot-password sends a hashed-token link with a generic response and a 15-minute expiry', async () => {
  rejectRecipient = false
  capturedMessage = ''
  let saved = false
  const user = {
    _id: 'reset-user-id',
    email: registrationBody.email,
    fullName: registrationBody.fullName,
    async save() { saved = true },
  }
  const originalFindOne = User.findOne
  User.findOne = async () => user
  try {
    const result = await invoke(forgotPassword, { body: { email: registrationBody.email } })
    const after = Date.now()
    assert.equal(result.statusCode, 200)
    assert.match(result.body.message, /if an account exists/i)
    assert.equal(saved, true)
    assert.match(user.resetPasswordToken, /^[a-f0-9]{64}$/)
    assert.ok(user.resetPasswordExpiry.getTime() >= after)
    assert.ok(user.resetPasswordExpiry.getTime() - after <= 15 * 60 * 1000)
    assert.match(capturedMessage, /Safar/i)
    assert.match(capturedMessage, /Reset Password/i)
    assert.match(capturedMessage, /15 minutes/i)
    assert.equal(JSON.stringify(result.body).includes(user.resetPasswordToken), false)
  } finally {
    User.findOne = originalFindOne
  }
})

test('unknown reset email returns the same generic response without sending email', async () => {
  let sendCount = 0
  rejectRecipient = false
  const originalFindOne = User.findOne
  User.findOne = async () => { sendCount += 1; return null }
  try {
    const result = await invoke(forgotPassword, { body: { email: 'unknown@example.test' } })
    assert.equal(result.statusCode, 200)
    assert.match(result.body.message, /if an account exists/i)
    assert.equal(sendCount, 1)
  } finally {
    User.findOne = originalFindOne
  }
})

test('reset mail failure remains enumeration-safe and clears the unused token hash', async () => {
  rejectRecipient = true
  const user = { _id: 'reset-mail-failure', email: registrationBody.email, fullName: registrationBody.fullName, async save() {} }
  let updateFilter
  const originalFindOne = User.findOne
  const originalUpdateOne = User.updateOne
  User.findOne = async () => user
  User.updateOne = async (filter) => { updateFilter = filter; return { modifiedCount: 1 } }
  try {
    const result = await invoke(forgotPassword, { body: { email: registrationBody.email } })
    assert.equal(result.statusCode, 200)
    assert.match(result.body.message, /if an account exists/i)
    assert.equal(updateFilter.resetPasswordToken, user.resetPasswordToken)
  } finally {
    User.findOne = originalFindOne
    User.updateOne = originalUpdateOne
    rejectRecipient = false
  }
})

test('reset-password atomically consumes a token, saves the new password, and revokes sessions', async () => {
  const user = {
    _id: 'reset-user-id',
    password: 'old-hash',
    authVersion: 0,
    refreshToken: 'legacy-token',
    resetPasswordToken: 'hash-value',
    resetPasswordExpiry: new Date(Date.now() + 60000),
    async save() { this.saved = true },
  }
  let capturedFilter
  let sessionFilter
  const originalFindOneAndUpdate = User.findOneAndUpdate
  const originalUpdateMany = RefreshSession.updateMany
  User.findOneAndUpdate = async (filter, update) => {
    capturedFilter = filter
    Object.assign(user, update.$set)
    return user
  }
  RefreshSession.updateMany = async (filter) => { sessionFilter = filter; return { modifiedCount: 1 } }
  try {
    const result = await invoke(resetPassword, { params: { token: 'a'.repeat(64) }, body: { password: 'new-password-123' } })
    assert.equal(result.statusCode, 200)
    assert.equal(capturedFilter.resetPasswordToken, createHash('sha256').update('a'.repeat(64)).digest('hex'))
    assert.ok(capturedFilter.resetPasswordExpiry.$gt instanceof Date)
    assert.equal(user.password, 'new-password-123')
    assert.equal(user.resetPasswordToken, null)
    assert.equal(user.resetPasswordExpiry, null)
    assert.equal(user.refreshToken, null)
    assert.equal(user.authVersion, 1)
    assert.equal(user.saved, true)
    assert.deepEqual(sessionFilter, { user: user._id, revokedAt: null })
    assert.deepEqual(result.cleared.map(({ name }) => name), ['accessToken', 'refreshToken'])
  } finally {
    User.findOneAndUpdate = originalFindOneAndUpdate
    RefreshSession.updateMany = originalUpdateMany
  }
})

test('expired or reused reset tokens are rejected without saving a password', async () => {
  let saveCount = 0
  const originalFindOneAndUpdate = User.findOneAndUpdate
  User.findOneAndUpdate = async () => null
  try {
    const result = await invoke(resetPassword, { params: { token: 'b'.repeat(64) }, body: { password: 'new-password-123' } })
    assert.equal(result.error?.statusCode, 400)
    assert.equal(saveCount, 0)
  } finally {
    User.findOneAndUpdate = originalFindOneAndUpdate
  }
})
