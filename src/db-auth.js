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
  // Enforces single-use: the row is read and deleted together. Callers still
  // need to check created_at against the TTL - an expired-but-present nonce
  // should also be treated as invalid.
  const row = await db.prepare('SELECT created_at FROM nonces WHERE nonce = ?').bind(nonce).first()
  if (!row) return null
  await db.prepare('DELETE FROM nonces WHERE nonce = ?').bind(nonce).run()
  return row.created_at
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

export async function getLoginAttempts (db, ip) {
  const row = await db.prepare('SELECT count, reset_at FROM login_attempts WHERE ip = ?').bind(ip).first()
  return row ? { count: row.count, resetAt: row.reset_at } : null
}

export async function setLoginAttempts (db, ip, record) {
  await db
    .prepare(
      `INSERT INTO login_attempts (ip, count, reset_at) VALUES (?, ?, ?)
       ON CONFLICT (ip) DO UPDATE SET count = excluded.count, reset_at = excluded.reset_at`
    )
    .bind(ip, record.count, record.resetAt)
    .run()
}

export async function deleteLoginAttempts (db, ip) {
  await db.prepare('DELETE FROM login_attempts WHERE ip = ?').bind(ip).run()
}

export async function deleteExpiredLoginAttempts (db, now) {
  await db.prepare('DELETE FROM login_attempts WHERE reset_at < ?').bind(now).run()
}
