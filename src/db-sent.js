export async function getSentByMessageId (db, messageId) {
  return db
    .prepare('SELECT id, message_id, in_reply_to FROM sent WHERE message_id = ?')
    .bind(messageId)
    .first()
}

export async function insertSent (db, sent) {
  const result = await db
    .prepare(
      `INSERT INTO sent (message_id, from_address, to_address, cc_address, bcc_address, subject, body, in_reply_to, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(sent.messageId, sent.fromAddress, sent.toAddress, sent.ccAddress || null, sent.bccAddress || null, sent.subject || null, sent.body || null, sent.inReplyTo || null, sent.createdAt)
    .run()
  return result.meta.last_row_id
}

export async function getSentById (db, id) {
  return db
    .prepare('SELECT id, message_id, from_address, to_address, cc_address, bcc_address, subject, body, in_reply_to, created_at FROM sent WHERE id = ?')
    .bind(id)
    .first()
}

export async function searchSent (db, { limit = 50, before = null, text = '' } = {}) {
  const conditions = []
  const params = []

  if (before !== null) {
    conditions.push('created_at < ?')
    params.push(before)
  }

  if (text) {
    conditions.push('(subject LIKE ? OR to_address LIKE ? OR body LIKE ?)')
    params.push(`%${text}%`, `%${text}%`, `%${text}%`)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const { results } = await db
    .prepare(
      `SELECT id, message_id, from_address, to_address, subject, created_at,
              SUBSTR(body, 1, 150) as preview
       FROM sent ${whereClause}
       ORDER BY created_at DESC LIMIT ?`
    )
    .bind(...params, limit)
    .all()

  return results
}

export async function getSentCount (db) {
  const row = await db.prepare('SELECT COUNT(*) as count FROM sent').first()
  return row.count
}

export async function deleteSentById (db, id) {
  await db.prepare('DELETE FROM sent WHERE id = ?').bind(id).run()
}
