import assert from 'node:assert/strict'
import test from 'node:test'
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
process.env.ACCESS_TOKEN_SECRET = 'access-test-secret'
process.env.REFRESH_TOKEN_SECRET = 'refresh-test-secret'
process.env.ACCESS_TOKEN_EXPIRY = '86400'
process.env.REFRESH_TOKEN_EXPIRY = '864000'
process.env.NODE_ENV = 'test'
delete process.env.JWT_ISSUER
delete process.env.JWT_AUDIENCE
const { default: User } = await import('../../src/models/User.js')
const { default: RefreshSession } = await import('../../src/models/RefreshSession.js')
const { login, refreshAccessToken, logoutUser, logoutAllSessions } = await import('../../src/controllers/authController.js')
const { verifyJWT } = await import('../../src/middlewares/auth.middleware.js')
const { tokenLifetimes, cookieOptions, verifySameOrigin, verifyTokenClaims } = await import('../../src/utils/token-policy.js')

function invoke(handler, req) {
  return new Promise((resolve) => {
    const response = {
      statusCode: null,
      cookies: [],
      cleared: [],
      status(code) { this.statusCode = code; return this },
      cookie(name, value, options) { this.cookies.push({ name, value, options }); return this },
      clearCookie(name, options) { this.cleared.push({ name, options }); return this },
      json(body) { resolve({ statusCode: this.statusCode, body, cookies: this.cookies, cleared: this.cleared }); return this },
    }
    handler(req, response, (error) => resolve({ error, cookies: response.cookies, cleared: response.cleared }))
  })
}

async function withOverrides(overrides, run) {
  const originals = overrides.map(({ model, methods }) => ({
    model,
    methods: Object.fromEntries(Object.keys(methods).map((name) => [name, model[name]])),
  }))
  for (const { model, methods } of overrides) Object.assign(model, methods)
  try { await run() } finally {
    for (const { model, methods } of originals) Object.assign(model, methods)
  }
}

const sha256 = (token) => crypto.createHash('sha256').update(token).digest('hex')
const userId = '64b000000000000000000010'

function makeUser(role = 'customer') {
  return {
    _id: userId,
    email: 'traveller@example.test',
    fullName: 'Safar Traveller',
    role,
    authVersion: 0,
    isActive: true,
    isEmailVerified: true,
    async isPasswordCorrect(password) { return password === 'correct-password' },
    generateAccessToken(claims = {}) {
      return jwt.sign({ ...claims, _id: userId, authVersion: 0, token_use: 'access' }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: tokenLifetimes.accessSeconds })
    },
    generateRefreshToken(claims = {}, expiresIn = tokenLifetimes.refreshSeconds) {
      return jwt.sign({ _id: userId, ...claims, token_use: 'refresh' }, process.env.REFRESH_TOKEN_SECRET, { expiresIn })
    },
  }
}

test('configured token lifetimes are capped at 15 minutes and 7 days', () => {
  assert.equal(tokenLifetimes.accessSeconds, 15 * 60)
  assert.equal(tokenLifetimes.refreshSeconds, 7 * 24 * 60 * 60)
  const cookie = cookieOptions(900000)
  assert.equal(cookie.httpOnly, true)
  assert.equal(cookie.sameSite, 'lax')
  assert.equal(cookie.secure, false)
  assert.equal(cookie.path, '/')
  const priorMode = process.env.NODE_ENV
  const priorSite = process.env.COOKIE_SAME_SITE
  process.env.NODE_ENV = 'production'
  process.env.COOKIE_SAME_SITE = 'none'
  process.env.COOKIE_DOMAIN = 'safar.example'
  const productionCookie = cookieOptions(1000)
  assert.equal(productionCookie.secure, true)
  assert.equal(productionCookie.sameSite, 'none')
  assert.equal(productionCookie.domain, 'safar.example')
  process.env.NODE_ENV = priorMode
  if (priorSite === undefined) delete process.env.COOKIE_SAME_SITE
  else process.env.COOKIE_SAME_SITE = priorSite
  delete process.env.COOKIE_DOMAIN
})

test('new access tokens enforce configured issuer and audience claims', () => {
  const priorIssuer = process.env.JWT_ISSUER
  const priorAudience = process.env.JWT_AUDIENCE
  process.env.JWT_ISSUER = 'safar-api'
  process.env.JWT_AUDIENCE = 'safar-web'
  const user = new User({ _id: userId, email: 'traveller@example.test', fullName: 'Safar Traveller' })
  const token = user.generateAccessToken()
  const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)
  assert.equal(decoded.token_use, 'access')
  assert.equal(decoded.iss, 'safar-api')
  assert.equal(decoded.aud, 'safar-web')
  assert.throws(() => verifyTokenClaims({ ...decoded, aud: 'other-client' }, 'access'), { statusCode: 401 })
  if (priorIssuer === undefined) delete process.env.JWT_ISSUER
  else process.env.JWT_ISSUER = priorIssuer
  if (priorAudience === undefined) delete process.env.JWT_AUDIENCE
  else process.env.JWT_AUDIENCE = priorAudience
})

test('login issues expiring HttpOnly cookies and stores only a refresh-token hash', async () => {
  const user = makeUser()
  const sessionRecords = []
  const safeUser = { _id: userId, role: 'customer', email: user.email }
  await withOverrides([
    { model: User, methods: {
      async findOne() { return user },
      findById() { return { select: async () => safeUser } },
      async updateOne() { return { modifiedCount: 1 } },
    } },
    { model: RefreshSession, methods: { async create(record) { sessionRecords.push(record); return record } } },
  ], async () => {
    const result = await invoke(login, { body: { email: user.email, password: 'correct-password' } })
    assert.equal(result.statusCode, 200)
    assert.deepEqual(result.body.data.user, safeUser)
    assert.equal(result.cookies.length, 2)
    assert.ok(result.cookies.every(({ options }) => options.httpOnly && options.path === '/'))
    const access = jwt.verify(result.cookies.find(({ name }) => name === 'accessToken').value, process.env.ACCESS_TOKEN_SECRET)
    assert.equal(access.exp - access.iat, 900)
    const refresh = result.cookies.find(({ name }) => name === 'refreshToken').value
    assert.notEqual(sessionRecords[0].tokenHash, refresh)
    assert.equal(sessionRecords[0].tokenHash, sha256(refresh))
    assert.ok(sessionRecords[0].absoluteExpiresAt instanceof Date)
  })
})

test('unverified login is identified by a stable response code without creating a session', async () => {
  const user = { ...makeUser(), isEmailVerified: false }
  let sessionCreated = false
  await withOverrides([
    { model: User, methods: { async findOne() { return user } } },
    { model: RefreshSession, methods: { async create() { sessionCreated = true; throw new Error('should not create a session') } } },
  ], async () => {
    const result = await invoke(login, { body: { email: user.email, password: 'correct-password' } })
    assert.equal(result.error?.statusCode, 403)
    assert.equal(result.error?.code, 'EMAIL_NOT_VERIFIED')
    assert.equal(sessionCreated, false)
  })
})

test('refresh rotates the token; reuse of a rotated token revokes its session family', async () => {
  const user = makeUser()
  const sessionId = '64b000000000000000000011'
  const familyId = 'family-a'
  const oldToken = jwt.sign({ _id: userId, sid: sessionId, fid: familyId, jti: 'jti-old', token_use: 'refresh' }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: 3600 })
  const session = {
    _id: sessionId,
    user: userId,
    familyId,
    tokenHash: sha256(oldToken),
    previousTokenHashes: [],
    expiresAt: new Date(Date.now() + 3600000),
    absoluteExpiresAt: new Date(Date.now() + 6 * 86400000),
    revokedAt: null,
  }
  let revokeCount = 0
  await withOverrides([
    { model: User, methods: { async findById() { return user } } },
    { model: RefreshSession, methods: {
      async findById() { return session },
      async findOneAndUpdate(filter, update) {
        if (session.tokenHash !== filter.tokenHash) return null
        session.previousTokenHashes.push(update.$push.previousTokenHashes)
        Object.assign(session, update.$set)
        return session
      },
      async updateMany(filter, update) { revokeCount += 1; Object.assign(session, update.$set); return { modifiedCount: 1 } },
    } },
  ], async () => {
    const result = await invoke(refreshAccessToken, { cookies: { refreshToken: oldToken } })
    assert.equal(result.statusCode, 200)
    const newToken = result.cookies.find(({ name }) => name === 'refreshToken').value
    assert.notEqual(newToken, oldToken)
    assert.equal(session.tokenHash, sha256(newToken))
    assert.ok(session.previousTokenHashes.includes(sha256(oldToken)))

    session.lastRotatedAt = new Date(Date.now() - 6_000)
    const reuse = await invoke(refreshAccessToken, { cookies: { refreshToken: oldToken } })
    assert.equal(reuse.error?.statusCode, 401)
    assert.equal(revokeCount, 1)
    assert.equal(session.revocationReason, 'refresh-token-reuse')
  })
})

test('simultaneous refresh requests return a usable access cookie without revoking the rotated session', async () => {
  const user = makeUser()
  const sessionId = '64b000000000000000000015'
  const familyId = 'family-concurrent'
  const oldToken = jwt.sign({ _id: userId, sid: sessionId, fid: familyId, jti: 'jti-concurrent', token_use: 'refresh' }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: 3600 })
  const session = {
    _id: sessionId,
    user: userId,
    familyId,
    tokenHash: sha256(oldToken),
    previousTokenHashes: [],
    expiresAt: new Date(Date.now() + 3600000),
    absoluteExpiresAt: new Date(Date.now() + 6 * 86400000),
    revokedAt: null,
  }
  let readCount = 0
  let revokeCount = 0
  await withOverrides([
    { model: User, methods: { async findById() { return user } } },
    { model: RefreshSession, methods: {
      async findById() {
        readCount += 1
        return structuredClone(session)
      },
      async findOneAndUpdate(filter, update) {
        if (session.tokenHash !== filter.tokenHash) return null
        session.previousTokenHashes.push(update.$push.previousTokenHashes)
        Object.assign(session, update.$set)
        return structuredClone(session)
      },
      async updateMany(filter, update) { revokeCount += 1; Object.assign(session, update.$set); return { modifiedCount: 1 } },
    } },
  ], async () => {
    const [first, second] = await Promise.all([
      invoke(refreshAccessToken, { cookies: { refreshToken: oldToken } }),
      invoke(refreshAccessToken, { cookies: { refreshToken: oldToken } }),
    ])
    assert.equal(first.statusCode, 200)
    assert.equal(second.statusCode, 200)
    assert.equal([first, second].filter((result) => result.cookies.some(({ name }) => name === 'refreshToken')).length, 1)
    assert.equal([first, second].filter((result) => result.cookies.some(({ name }) => name === 'accessToken')).length, 2)
    assert.ok(readCount >= 3)
    assert.equal(revokeCount, 0)
    assert.equal(session.tokenHash, sha256(first.cookies.find(({ name }) => name === 'refreshToken')?.value || second.cookies.find(({ name }) => name === 'refreshToken').value))
  })
})

test('legacy plaintext refresh cookie migrates lazily without returning its token in JSON', async () => {
  const user = makeUser()
  const legacyToken = jwt.sign({ _id: userId }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: 86400 })
  let legacyRevoked = false
  let createdSession
  await withOverrides([
    { model: User, methods: {
      async findOne(filter) { return filter.refreshToken === legacyToken && !legacyRevoked ? user : null },
      async updateOne(filter) { legacyRevoked = filter.refreshToken === legacyToken; return { modifiedCount: legacyRevoked ? 1 : 0 } },
    } },
    { model: RefreshSession, methods: {
      async create(record) { createdSession = record; return record },
      async findOne(filter) { return filter.previousTokenHashes === sha256(legacyToken) ? createdSession : null },
      async updateMany(filter, update) { Object.assign(createdSession, update.$set); return { modifiedCount: 1 } },
    } },
  ], async () => {
    const result = await invoke(refreshAccessToken, { cookies: { refreshToken: legacyToken } })
    assert.equal(result.statusCode, 200)
    assert.equal(legacyRevoked, true)
    assert.deepEqual(result.body.data, {})
    assert.deepEqual(createdSession.previousTokenHashes, [sha256(legacyToken)])
    assert.equal(createdSession.tokenHash, sha256(result.cookies.find(({ name }) => name === 'refreshToken').value))
    const replay = await invoke(refreshAccessToken, { cookies: { refreshToken: legacyToken } })
    assert.equal(replay.error?.statusCode, 401)
    assert.equal(createdSession.revocationReason, 'refresh-token-reuse')
  })
})

test('invalid and expired refresh tokens fail without rotating a session', async () => {
  let sessionLookupCount = 0
  await withOverrides([{ model: RefreshSession, methods: { async findById() { sessionLookupCount += 1; return null } } }], async () => {
    const invalid = await invoke(refreshAccessToken, { cookies: { refreshToken: 'not-a-jwt' } })
    const expiredToken = jwt.sign({ _id: userId }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: -1 })
    const expired = await invoke(refreshAccessToken, { cookies: { refreshToken: expiredToken } })
    assert.equal(invalid.error?.statusCode, 401)
    assert.equal(expired.error?.statusCode, 401)
    assert.deepEqual(invalid.cleared.map(({ name }) => name), ['accessToken', 'refreshToken'])
    assert.deepEqual(expired.cleared.map(({ name }) => name), ['accessToken', 'refreshToken'])
    assert.equal(sessionLookupCount, 0)
  })
})

test('logout revokes the cookie session and clears both HttpOnly cookies', async () => {
  const sessionId = '64b000000000000000000012'
  const token = jwt.sign({ _id: userId, sid: sessionId, fid: 'family-logout', jti: 'jti-logout', token_use: 'refresh' }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: 3600 })
  const session = { _id: sessionId, user: userId, familyId: 'family-logout' }
  let revoked = false
  await withOverrides([{ model: RefreshSession, methods: {
    async findById() { return session },
    async updateMany(filter, update) { revoked = filter.familyId === session.familyId; Object.assign(session, update.$set); return { modifiedCount: 1 } },
  } }], async () => {
    const result = await invoke(logoutUser, { cookies: { refreshToken: token } })
    assert.equal(result.statusCode, 200)
    assert.equal(revoked, true)
    assert.deepEqual(result.cleared.map(({ name }) => name), ['accessToken', 'refreshToken'])
  })
})

test('logout-all revokes every active session for the authenticated database user', async () => {
  let filter
  let update
  let userUpdate
  await withOverrides([
    { model: RefreshSession, methods: { async updateMany(nextFilter, nextUpdate) { filter = nextFilter; update = nextUpdate; return { modifiedCount: 2 } } } },
    { model: User, methods: { async updateOne(nextFilter, nextUpdate) { userUpdate = nextUpdate; return { modifiedCount: 1 } } } },
  ], async () => {
    const result = await invoke(logoutAllSessions, { user: { _id: userId } })
    assert.equal(result.statusCode, 200)
    assert.deepEqual(filter, { user: userId, revokedAt: null })
    assert.equal(update.$set.revocationReason, 'logout-all')
    assert.equal(userUpdate.$inc.authVersion, 1)
  })
})

test('refresh/logout reject a foreign browser Origin and accept the configured local origin', () => {
  const outcome = (origin) => {
    let error
    verifySameOrigin({ get: (name) => name === 'origin' ? origin : undefined }, {}, (nextError) => { error = nextError })
    return error
  }
  assert.equal(outcome('http://localhost:5173'), undefined)
  assert.equal(outcome('https://attacker.example')?.statusCode, 403)
})

test('JWT middleware uses the database role for customer and admin sessions', async () => {
  for (const role of ['customer', 'admin']) {
    const sessionId = role === 'admin' ? '64b000000000000000000014' : '64b000000000000000000013'
    const familyId = `family-${role}`
    const token = jwt.sign({ _id: userId, authVersion: 0, sid: sessionId, fid: familyId, token_use: 'access' }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: 300 })
    const dbUser = { _id: userId, role }
    const session = { _id: sessionId, user: userId, familyId, expiresAt: new Date(Date.now() + 60000), absoluteExpiresAt: new Date(Date.now() + 60000), revokedAt: null }
    await withOverrides([
      { model: User, methods: { findById() { return { select: async () => dbUser } } } },
      { model: RefreshSession, methods: { async findById() { return session } } },
    ], async () => {
      const req = { cookies: { accessToken: token }, header() {} }
      const result = await new Promise((resolve) => verifyJWT(req, {}, (error) => resolve({ error })))
      assert.equal(result.error, undefined)
      assert.equal(req.user.role, role)
    })
  }
})
