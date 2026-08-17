export async function getBlocklistPatterns (db) {
  const { results } = await db.prepare('SELECT pattern FROM blocklist').all()
  return results.map((row) => row.pattern)
}

export async function addBlocklistPattern (db, pattern) {
  await db.prepare('INSERT OR IGNORE INTO blocklist (pattern) VALUES (?)').bind(pattern).run()
}

export async function getAllowlistPatterns (db, kind) {
  const { results } = await db
    .prepare('SELECT pattern FROM allowed_notifications WHERE kind = ?')
    .bind(kind)
    .all()
  return results.map((row) => row.pattern)
}

export async function getSetting (db, key) {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first()
  return row ? row.value : null
}

export async function setSetting (db, key, value) {
  await db
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`
    )
    .bind(key, value)
    .run()
}
