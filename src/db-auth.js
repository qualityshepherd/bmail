export async function deleteExpiredNonces (db, cutoffTimestamp) {
  await db.prepare('DELETE FROM nonces WHERE created_at < ?').bind(cutoffTimestamp).run()
}

export async function deleteExpiredSessions (db, cutoffTimestamp) {
  await db.prepare('DELETE FROM sessions WHERE created_at < ?').bind(cutoffTimestamp).run()
}

export async function insertNonce (db, nonce, createdAt) {
  await db.prepare('INSERT INTO nonces (nonce, created_at) VALUES (?, ?)').bind(nonce, createdAt).run()
}

export async function consumeNonce (db, nonce) {
  // Atomic: DELETE RETURNING means only one concurrent request can get the
  // row back. A second request racing on the same nonce gets null, not the
  // timestamp, so replays are impossible even under concurrent retries.
  const row = await db.prepare('DELETE FROM nonces WHERE nonce = ? RETURNING created_at').bind(nonce).first()
  return row ? row.created_at : null
}

export async function insertSession (db, token, createdAt) {
  await db.prepare('INSERT INTO sessions (token, created_at) VALUES (?, ?)').bind(token, createdAt).run()
}

export async function getSessionCreatedAt (db, token) {
  const row = await db.prepare('SELECT created_at FROM sessions WHERE token = ?').bind(token).first()
  return row ? row.created_at : null
}

export async function deleteSession (db, token) {
  await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run()
}

// table is interpolated into SQL below - restricted to a known set so this
// can't become an injection vector if a future callsite passes it dynamically.
const RATE_LIMIT_TABLES = new Set(['login_attempts', 'challenge_attempts'])

export async function getRateLimit (db, table, ip) {
  if (!RATE_LIMIT_TABLES.has(table)) throw new Error('invalid rate limit table')
  const row = await db.prepare(`SELECT count, reset_at FROM ${table} WHERE ip = ?`).bind(ip).first()
  return row ? { count: row.count, resetAt: row.reset_at } : null
}

// Atomic: the count/reset_at transition happens inside the UPSERT itself,
// so two concurrent requests from the same IP can't both read the same
// stale count and each write count+1, silently losing an attempt.
export async function incrementRateLimit (db, table, ip, now, windowMs) {
  if (!RATE_LIMIT_TABLES.has(table)) throw new Error('invalid rate limit table')
  const resetAt = now + windowMs
  await db
    .prepare(
      `INSERT INTO ${table} (ip, count, reset_at) VALUES (?, 1, ?)
       ON CONFLICT (ip) DO UPDATE SET
         count = CASE WHEN reset_at <= ? THEN 1 ELSE count + 1 END,
         reset_at = CASE WHEN reset_at <= ? THEN ? ELSE reset_at END`
    )
    .bind(ip, resetAt, now, now, resetAt)
    .run()
}

export async function deleteLoginAttempts (db, ip) {
  await db.prepare('DELETE FROM login_attempts WHERE ip = ?').bind(ip).run()
}

export async function deleteExpiredLoginAttempts (db, now) {
  await db.prepare('DELETE FROM login_attempts WHERE reset_at < ?').bind(now).run()
  await db.prepare('DELETE FROM challenge_attempts WHERE reset_at < ?').bind(now).run()
}
