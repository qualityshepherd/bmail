import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  timingSafeEqual, isAuthorizedPubkey, isRateLimited,
  generateNonce, generateSessionToken, isNonceExpired, isSessionExpired,
  hexToBytes, sessionCookie, clearedSessionCookie, parseCookies,
  hashToken, NONCE_TTL_MS, SESSION_TTL_MS
} from '../src/auth.js'

test('isAuthorizedPubkey: matching pubkey returns true', () => {
  assert.equal(isAuthorizedPubkey('abc123', { AUTH_PUBKEY: 'abc123' }), true)
})

test('isAuthorizedPubkey: trims whitespace', () => {
  assert.equal(isAuthorizedPubkey('abc123', { AUTH_PUBKEY: '  abc123  ' }), true)
})

test('isAuthorizedPubkey: matches second key in comma-separated list', () => {
  assert.equal(isAuthorizedPubkey('key2', { AUTH_PUBKEY: 'key1,key2,key3' }), true)
})

test('isAuthorizedPubkey: mismatched pubkey returns false', () => {
  assert.equal(isAuthorizedPubkey('abc123', { AUTH_PUBKEY: 'xyz' }), false)
})

test('isAuthorizedPubkey: missing pubkey returns false', () => {
  assert.equal(isAuthorizedPubkey(null, { AUTH_PUBKEY: 'abc123' }), false)
  assert.equal(isAuthorizedPubkey('', { AUTH_PUBKEY: 'abc123' }), false)
})

test('isAuthorizedPubkey: missing env.AUTH_PUBKEY returns false', () => {
  assert.equal(isAuthorizedPubkey('abc123', {}), false)
  assert.equal(isAuthorizedPubkey('abc123', { AUTH_PUBKEY: '' }), false)
})

test('timingSafeEqual: equal strings return true', () => {
  assert.equal(timingSafeEqual('hello', 'hello'), true)
})

test('timingSafeEqual: different strings return false', () => {
  assert.equal(timingSafeEqual('hello', 'world'), false)
})

test('timingSafeEqual: different lengths return false', () => {
  assert.equal(timingSafeEqual('abc', 'abcd'), false)
})

test('timingSafeEqual: empty strings return false', () => {
  assert.equal(timingSafeEqual('', ''), false)
})

test('isRateLimited: null record is not limited', () => {
  assert.equal(isRateLimited(null, Date.now(), 6), false)
})

test('isRateLimited: under max attempts is not limited', () => {
  assert.equal(isRateLimited({ count: 3, resetAt: Date.now() + 10000 }, Date.now(), 6), false)
})

test('isRateLimited: at max attempts is limited', () => {
  assert.equal(isRateLimited({ count: 6, resetAt: Date.now() + 10000 }, Date.now(), 6), true)
})

test('isRateLimited: expired window is not limited even at max', () => {
  assert.equal(isRateLimited({ count: 6, resetAt: Date.now() - 1 }, Date.now(), 6), false)
})

// nonce / session generation and expiry
test('generateNonce: returns 32 hex chars (16 bytes)', () => {
  const nonce = generateNonce()
  assert.equal(nonce.length, 32)
  assert.match(nonce, /^[0-9a-f]+$/)
})

test('generateNonce: returns different values each call', () => {
  assert.notEqual(generateNonce(), generateNonce())
})

test('generateSessionToken: returns 64 hex chars (32 bytes)', () => {
  const token = generateSessionToken()
  assert.equal(token.length, 64)
  assert.match(token, /^[0-9a-f]+$/)
})

test('isNonceExpired: fresh nonce is not expired', () => {
  const now = Date.now()
  assert.equal(isNonceExpired(now, now), false)
})

test('isNonceExpired: nonce older than TTL is expired', () => {
  const now = Date.now()
  assert.equal(isNonceExpired(now - NONCE_TTL_MS - 1, now), true)
})

test('isSessionExpired: fresh session is not expired', () => {
  const now = Date.now()
  assert.equal(isSessionExpired(now, now), false)
})

test('isSessionExpired: session older than TTL is expired', () => {
  const now = Date.now()
  assert.equal(isSessionExpired(now - SESSION_TTL_MS - 1, now), true)
})

// hexToBytes
test('hexToBytes: converts hex string to byte array', () => {
  const bytes = hexToBytes('deadbeef')
  assert.deepEqual(Array.from(bytes), [0xde, 0xad, 0xbe, 0xef])
})

test('sessionCookie: includes HttpOnly, Secure, SameSite=Lax', () => {
  const cookie = sessionCookie('abc123', 'bmail_session', 86400)
  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /Secure/)
  assert.match(cookie, /SameSite=Lax/)
  assert.match(cookie, /bmail_session=abc123/)
})

test('clearedSessionCookie: sets Max-Age=0', () => {
  const cookie = clearedSessionCookie('bmail_session')
  assert.match(cookie, /Max-Age=0/)
})

test('parseCookies: parses multiple cookies', () => {
  const parsed = parseCookies('bmail_session=abc123; other=xyz')
  assert.equal(parsed.bmail_session, 'abc123')
  assert.equal(parsed.other, 'xyz')
})

test('parseCookies: handles empty/missing header', () => {
  assert.deepEqual(parseCookies(null), {})
  assert.deepEqual(parseCookies(''), {})
})

test('hashToken: returns 64-char hex SHA-256', async () => {
  const h = await hashToken('sometoken')
  assert.equal(h.length, 64)
  assert.match(h, /^[0-9a-f]+$/)
})

test('hashToken: same input yields same hash', async () => {
  assert.equal(await hashToken('abc'), await hashToken('abc'))
})

test('hashToken: different inputs yield different hashes', async () => {
  assert.notEqual(await hashToken('abc'), await hashToken('xyz'))
})
