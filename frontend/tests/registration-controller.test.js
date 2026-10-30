import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import net from 'node:net'
import test, { after } from 'node:test'
import User from '../../src/models/User.js'
import RefreshSession from '../../src/models/RefreshSession.js'

let rejectRecipient = false
let capturedMessage = ''
const smtpServer = net.createServer((socket) => {
  socket.setEncoding('utf8')
  socket.write('220 safar-test-smtp ESMTP\r\n')
  let buffer = ''
  let readingMessage = false

  socket.on('data', (chunk) => {
    buffer += chunk
    let lineEnd = buffer.indexOf('\r\n')
    while (lineEnd !== -1) {
      const line = buffer.slice(0, lineEnd)
      buffer = buffer.slice(lineEnd + 2)

      if (readingMessage) {
        if (line === '.') {
          readingMessage = false
          socket.write('250 2.0.0 queued for test\r\n')
        } else {
          capturedMessage += `${line}\r\n`
        }
      } else if (/^(EHLO|HELO) /i.test(line)) {
        socket.write('250-safar-test-smtp\r\n250-8BITMIME\r\n250 SMTPUTF8\r\n')
      } else if (/^MAIL FROM:/i.test(line)) {
        socket.write('250 2.1.0 sender accepted\r\n')
      } else if (/^RCPT TO:/i.test(line)) {
        socket.write(rejectRecipient
          ? '550 5.1.1 recipient rejected for test\r\n'
          : '250 2.1.5 recipient accepted\r\n')
      } else if (/^DATA$/i.test(line)) {
        readingMessage = true
        socket.write('354 end with <CRLF>.<CRLF>\r\n')
      } else if (/^QUIT$/i.test(line)) {
        socket.write('221 2.0.0 goodbye\r\n')
        socket.end()
      } else {
        socket.write('250 2.0.0 ok\r\n')
      }

      lineEnd = buffer.indexOf('\r\n')
    }
  })
})

await new Promise((resolve, reject) => {
  smtpServer.once('error', reject)
  smtpServer.listen(0, '127.0.0.1', resolve)
})

process.env.BREVO_SENDER_EMAIL = 'sender@example.test'
process.env.BREVO_SMTP_HOST = '127.0.0.1'
process.env.BREVO_SMTP_PORT = String(smtpServer.address().port)
delete process.env.BREVO_SMTP_USER
delete process.env.BREVO_SMTP_PASS

const { registerUser, resendVerificationEmail, forgotPassword, resetPassword } = await import('../../src/controllers/authController.js')

after(() => new Promise((resolve) => smtpServer.close(resolve)))

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
  User.create = async () => createdUser
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

test('registration succeeds only when the SMTP server accepts the registered recipient', async () => {
  rejectRecipient = false
  const createdUser = { ...registrationBody, _id: 'test-user-id', isEmailVerified: false }

  await withUserStubs({ createdUser }, async () => {
    const result = await invoke(registerUser, { body: registrationBody })
    assert.equal(result.statusCode, 201)
    assert.match(result.body.message, /registration successful/i)
    assert.equal(createdUser.isEmailVerified, false)
  })
})

test('registration keeps the created account and returns an email-send error when SMTP rejects the recipient', async () => {
  rejectRecipient = true
  const createdUser = { ...registrationBody, _id: 'test-user-id', isEmailVerified: false }
  const originalConsoleError = console.error
  console.error = () => {}

  try {
    await withUserStubs({ createdUser }, async () => {
      const result = await invoke(registerUser, { body: registrationBody })
      assert.equal(result.error?.statusCode, 503)
      assert.match(result.error?.message, /account created, but the verification email could not be sent/i)
      assert.equal(createdUser.isEmailVerified, false)
    })
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

test('resend uses the existing verification route and reports success after SMTP acceptance', async () => {
  rejectRecipient = false
  let saved = false
  const user = {
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
