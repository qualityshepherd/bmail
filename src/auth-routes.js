import {
  isAuthorizedPubkey, isRateLimited,
  LOGIN_RATE_LIMIT_MAX_ATTEMPTS, LOGIN_RATE_LIMIT_WINDOW_MS,
  CHALLENGE_RATE_LIMIT_MAX_ATTEMPTS, CHALLENGE_RATE_LIMIT_WINDOW_MS,
  generateNonce, generateSessionToken, isNonceExpired, isSessionExpired,
  verifySignature, hexToBytes, sessionCookie, clearedSessionCookie, parseCookies,
  hashToken
} from './auth.js'
import {
  insertNonce, consumeNonce, insertSession, getSessionCreatedAt, deleteSession,
  getRateLimit, incrementRateLimit, deleteLoginAttempts
} from './db.js'
import { renderLoginPage } from './login-page.js'

function json (data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

async function parseJsonBody (req) {
  try {
    return await req.json()
  } catch {
    return null
  }
}

// GET /api/challenge - issues a fresh, persisted, single-use nonce, and
// tells the frontend whether AUTH_PUBKEY is configured yet (so it knows
// whether to show the login form or the first-run setup form).
export async function handleChallenge (req, env) {
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown'
  const now = Date.now()

  // Independent from login_attempts - issuing a challenge never used to cost
  // anything, so a client could hit this endpoint indefinitely without ever
  // failing a login, generating unbounded nonce rows. This counts issuance
  // itself, not just failed logins.
  const challengeRecord = await getRateLimit(env.DB, 'challenge_attempts', ip)
  if (isRateLimited(challengeRecord, now, CHALLENGE_RATE_LIMIT_MAX_ATTEMPTS)) {
    return json({ error: 'too many attempts' }, 429)
  }
  await incrementRateLimit(env.DB, 'challenge_attempts', ip, now, CHALLENGE_RATE_LIMIT_WINDOW_MS)

  const nonce = generateNonce()
  await insertNonce(env.DB, nonce, now)
  return json({ challenge: nonce, configured: !!env.AUTH_PUBKEY })
}

// POST /api/login - body: { pubkey, challenge, sig }
// pubkey is the hex-encoded raw Ed25519 public key, checked against
// env.AUTH_PUBKEY (set in wrangler.toml after running the setup form once).
export async function handleLogin (req, env) {
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown'
  const now = Date.now()

  if (!env.AUTH_PUBKEY) return json({ error: 'not configured' }, 503)

  const rlRecord = await getRateLimit(env.DB, 'login_attempts', ip)
  if (isRateLimited(rlRecord, now, LOGIN_RATE_LIMIT_MAX_ATTEMPTS)) {
    return json({ error: 'too many attempts' }, 429)
  }

  const body = await parseJsonBody(req)
  if (!body) return json({ error: 'invalid json' }, 400)
  const { pubkey, challenge, sig } = body
  if (!pubkey || !challenge || !sig) return json({ error: 'missing fields' }, 400)

  const fail = async () => {
    await incrementRateLimit(env.DB, 'login_attempts', ip, now, LOGIN_RATE_LIMIT_WINDOW_MS)
    return json({ error: 'unauthorized' }, 401)
  }

  if (!isAuthorizedPubkey(pubkey, env)) return fail()

  // Single-use: consuming deletes the nonce regardless of what happens next,
  // so a captured (challenge, sig) pair can never be replayed even if the
  // rest of verification below were somehow bypassed.
  const nonceCreatedAt = await consumeNonce(env.DB, challenge)
  if (nonceCreatedAt === null) return fail()
  if (isNonceExpired(nonceCreatedAt, now)) return fail()

  const valid = await verifySignature(challenge, sig, hexToBytes(pubkey))
  if (!valid) return fail()

  await deleteLoginAttempts(env.DB, ip)

  const token = generateSessionToken()
  await insertSession(env.DB, await hashToken(token), now)

  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': sessionCookie(token, env.SESSION_COOKIE_NAME, 7 * 24 * 60 * 60)
    }
  })
}

// POST /api/logout
export async function handleLogout (req, env) {
  const cookies = parseCookies(req.headers.get('Cookie'))
  const token = cookies[env.SESSION_COOKIE_NAME]
  if (token) await deleteSession(env.DB, await hashToken(token))

  return new Response(null, {
    status: 302,
    headers: {
      Location: '/login',
      'Set-Cookie': clearedSessionCookie(env.SESSION_COOKIE_NAME)
    }
  })
}

// GET /api/me - simple check that the current cookie is a valid session
export async function handleMe (req, env) {
  const session = await getValidSession(req, env)
  if (!session) return json({ authenticated: false }, 401)
  return json({ authenticated: true })
}

// Returns { token, createdAt } if the request carries a valid, non-expired
// session cookie, otherwise null. Use this to guard any route.
export async function getValidSession (req, env) {
  const cookies = parseCookies(req.headers.get('Cookie'))
  const token = cookies[env.SESSION_COOKIE_NAME]
  if (!token) return null

  const tokenHash = await hashToken(token)
  const createdAt = await getSessionCreatedAt(env.DB, tokenHash)
  if (createdAt === null) return null
  if (isSessionExpired(createdAt, Date.now())) {
    await deleteSession(env.DB, tokenHash)
    return null
  }

  return { token, createdAt }
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; connect-src 'self' https://cloudflareinsights.com; img-src 'self' https: blob:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'"
}

// Wraps a route handler so it 401s without a valid session, and applies
// strict security headers to whatever response it produces. Any extra
// args beyond (req, env, ctx) are forwarded through to the handler after
// session - lets index.js pass route params like an email id.
export function withAuth (handler) {
  return async (req, env, ctx, ...extra) => {
    const session = await getValidSession(req, env)
    if (!session) {
      return new Response(
        renderLoginPage(),
        { status: 401, headers: { ...SECURITY_HEADERS, 'Content-Type': 'text/html; charset=utf-8' } }
      )
    }
    return handler(req, env, ctx, session, ...extra)
  }
}
