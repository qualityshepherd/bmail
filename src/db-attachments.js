export async function insertAttachment (db, attachment) {
  await db
    .prepare(
      `INSERT INTO attachments (email_id, filename, content_type, r2_key, size)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(
      attachment.emailId,
      attachment.filename,
      attachment.contentType,
      attachment.r2Key,
      attachment.size
    )
    .run()
}

// Finds attachments whose parent email is older than the cutoff. Only the
// R2 blob and this metadata row get deleted - the email itself is kept
// forever. Returns both r2_key (to delete from R2) and id (to delete the
// D1 row after).
export async function getStaleAttachments (db, cutoffTimestamp) {
  const { results } = await db
    .prepare(
      `SELECT attachments.id, attachments.r2_key
       FROM attachments
       JOIN emails ON attachments.email_id = emails.id
       WHERE emails.created_at < ?`
    )
    .bind(cutoffTimestamp)
    .all()
  return results
}

export async function deleteAttachmentsByIds (db, ids) {
  if (ids.length === 0) return
  const placeholders = ids.map(() => '?').join(',')
  await db.prepare(`DELETE FROM attachments WHERE id IN (${placeholders})`).bind(...ids).run()
}

export async function getAttachmentR2Keys (db, emailIds) {
  if (emailIds.length === 0) return []
  const placeholders = emailIds.map(() => '?').join(',')
  const { results } = await db
    .prepare(`SELECT r2_key FROM attachments WHERE email_id IN (${placeholders})`)
    .bind(...emailIds)
    .all()
  return results.map((row) => row.r2_key)
}

export async function getAttachmentsByEmailId (db, emailId) {
  const { results } = await db
    .prepare('SELECT id, filename, content_type, size FROM attachments WHERE email_id = ?')
    .bind(emailId)
    .all()
  return results
}

export async function getAttachmentById (db, attachmentId) {
  return db
    .prepare('SELECT id, email_id, filename, content_type, r2_key, size FROM attachments WHERE id = ?')
    .bind(attachmentId)
    .first()
}
