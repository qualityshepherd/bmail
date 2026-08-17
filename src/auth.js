// Pure functions for auth decisions - no D1/env access here, so these are
// trivially unit-testable. Ported and adapted from the Discover project's
// auth.js: timingSafeEqual and the rate-limit shape carry over directly.
// Ownership is checked against env.AUTH_PUBKEY (wrangler.toml vars), not
// a D1 table, to avoid a first-write-wins bootstrap race on an empty table.

export const timingSafeEqual = (a, b) => {
  const te = new TextEncoder()
  const ab = te.encode(a)
  const bb = te.encode(b)
  if (ab.length !== bb.length) return false
  let diff = 0
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i]
  return diff === 0
}

// AUTH_PUBKEY holds one or more hex-encoded raw Ed25519 public keys,
// comma-separated (e.g. one per device). Set via wrangler.toml [vars],
// never in D1 - registering a key requires deploy access, not just an
// HTTP request, which avoids a first-write-wins bootstrap race.
export const isAuthorizedPubkey = (pubkey, env) => {
  if (!pubkey || !env.AUTH_PUBKEY) return false
  const candidates = env.AUTH_PUBKEY.split(',').map((k) => k.trim()).filter(Boolean)
  return candidates.some((candidate) => timingSafeEqual(pubkey.trim(), candidate))
}

export const isRateLimited = (record, now, maxAttempts) =>
  !!record && now < record.resetAt && record.count >= maxAttempts

export const incrementAttempt = (record, now, windowMs) => {
  if (!record || now >= record.resetAt) return { count: 1, resetAt: now + windowMs }
  return { count: record.count + 1, resetAt: record.resetAt }
}

export const NONCE_TTL_MS = 5 * 60 * 1000
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000
export const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 6
export const LOGIN_RATE_LIMIT_WINDOW_MS = 12 * 60 * 1000

export function generateNonce () {
  const buf = new Uint8Array(16)
  crypto.getRandomValues(buf)
  return Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function generateSessionToken () {
  const buf = new Uint8Array(32)
  crypto.getRandomValues(buf)
  return Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function isNonceExpired (createdAt, now) {
  return now - createdAt > NONCE_TTL_MS
}

export function isSessionExpired (createdAt, now) {
  return now - createdAt > SESSION_TTL_MS
}

export function hexToBytes (hex) {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

// Verifies an Ed25519 signature over the nonce string, using the raw public
// key bytes stored in D1, via native Web Crypto (no third-party crypto libs).
export async function verifySignature (nonceHex, sigHex, publicKeyBytes) {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      publicKeyBytes,
      { name: 'Ed25519' },
      false,
      ['verify']
    )
    const message = new TextEncoder().encode(nonceHex)
    const signature = hexToBytes(sigHex)
    return await crypto.subtle.verify('Ed25519', key, signature, message)
  } catch (err) {
    // Malformed hex, wrong key length, unsupported algorithm, etc. all land
    // here - treat any verification failure as "not valid", never throw
    // through to the caller.
    return false
  }
}

export function sessionCookie (token, cookieName, maxAgeSeconds) {
  return `${cookieName}=${token}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Strict`
}

export function clearedSessionCookie (cookieName) {
  return `${cookieName}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`
}

export function parseCookies (cookieHeader) {
  const cookies = {}
  if (!cookieHeader) return cookies
  for (const pair of cookieHeader.split(';')) {
    const idx = pair.indexOf('=')
    if (idx === -1) continue
    const key = pair.slice(0, idx).trim()
    const value = pair.slice(idx + 1).trim()
    cookies[key] = value
  }
  return cookies
}
