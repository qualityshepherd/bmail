import { getSentByMessageId } from './db-sent.js'

export function isDuplicateKeyError (err) {
  // D1's error message text for a unique-constraint violation - matched
  // defensively by substring since the exact error shape isn't guaranteed
  // stable across Workers/D1 versions. Lives here (not pipeline.js) because
  // pipeline.js imports 'cloudflare:email' at module scope, which throws
  // ERR_UNSUPPORTED_ESM_URL_SCHEME in plain Node - this needs to stay
  // testable outside the Workers runtime.
  return !!(err && typeof err.message === 'string' && err.message.includes('UNIQUE constraint failed'))
}

export async function insertEmail (db, email) {
  const result = await db
    .prepare(
      `INSERT INTO emails (sender, recipient, subject, body, message_id, in_reply_to, created_at, sender_display, cc, status, status_changed_at, list_unsubscribe, dmarc_result)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      email.sender,
      email.recipient,
      email.subject,
      email.body,
      email.messageId,
      email.inReplyTo,
      email.createdAt,
      email.senderDisplay || null,
      email.cc || null,
      email.status || 'inbox',
      email.createdAt,
      email.listUnsubscribe || null,
      email.dmarcResult || null
    )
    .run()

  return result.meta.last_row_id
}

// Shared WHERE-clause builder for the three functions that filter emails by
// the same set of criteria. Tags use plain LIKE - can false-positive on
// partial names (e.g. "tax" matching "taxes"), accepted tradeoff of the
// simple text-column tag design.
function buildEmailConditions (filters) {
  const conditions = []
  const params = []
  let fromClause = 'FROM emails'

  if (!filters.all && filters.status) {
    conditions.push('emails.status = ?')
    params.push(filters.status)
  }
  conditions.push(...filters.tags.map(() => 'emails.tags LIKE ?'))
  params.push(...filters.tags.map((tag) => `%${tag}%`))
  if (filters.starred) conditions.push('emails.starred = 1')
  if (filters.text) {
    fromClause = 'FROM emails JOIN emails_fts ON emails.id = emails_fts.rowid'
    conditions.push('emails_fts MATCH ?')
    // Wrap each term in FTS5 double-quotes so special characters (OR, AND,
    // *, unbalanced quotes) are treated as literals, not query operators.
    // Inner double-quotes are escaped by doubling per the FTS5 spec.
    const ftsParam = filters.text.split(/\s+/).filter(Boolean)
      .map((t) => `"${t.replace(/"/g, '""')}"`)
      .join(' ')
    params.push(ftsParam)
  }

  return { conditions, params, fromClause }
}

// Cursor-based pagination via `before` (a created_at timestamp), not OFFSET -
// correct under concurrent inserts and cheap at any scale.
export async function searchEmails (db, filters, { limit = 50, before = null, beforeId = null, after = null, afterId = null } = {}) {
  const { conditions, params, fromClause } = buildEmailConditions(filters)

  if (before !== null) {
    conditions.push('(emails.created_at < ? OR (emails.created_at = ? AND emails.id < ?))')
    params.push(before, before, beforeId)
  }
  if (after !== null) {
    conditions.push('(emails.created_at > ? OR (emails.created_at = ? AND emails.id > ?))')
    params.push(after, after, afterId)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const { results } = await db
    .prepare(
      `SELECT emails.id, emails.sender, emails.sender_display, emails.subject,
              emails.starred, emails.status, emails.read, emails.tags, emails.created_at,
              emails.dmarc_result, SUBSTR(emails.body, 1, 150) as preview
       ${fromClause} ${whereClause}
       ORDER BY emails.created_at DESC, emails.id DESC LIMIT ?`
    )
    .bind(...params, limit)
    .all()

  return results
}

export async function getEmailCount (db, filters) {
  const { conditions, params, fromClause } = buildEmailConditions(filters)
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const row = await db
    .prepare(`SELECT COUNT(*) as count ${fromClause} ${whereClause}`)
    .bind(...params)
    .first()
  return row ? row.count : 0
}

export async function getEmailById (db, id) {
  return db
    .prepare('SELECT id, sender, sender_display, recipient, subject, body, message_id, in_reply_to, starred, status, read, tags, cc, created_at, list_unsubscribe, dmarc_result FROM emails WHERE id = ?')
    .bind(id)
    .first()
}

export async function setStarred (db, id, starred) {
  await db.prepare('UPDATE emails SET starred = ? WHERE id = ?').bind(starred ? 1 : 0, id).run()
}

export async function setStatus (db, id, status, now) {
  await db.prepare('UPDATE emails SET status = ?, status_changed_at = ? WHERE id = ?').bind(status, now, id).run()
}

export async function markRead (db, id) {
  // One-way by design - there is no unmarkRead(). Read state describes what
  // happened; it isn't a reminder mechanism (that's what starred is for).
  await db.prepare('UPDATE emails SET read = 1 WHERE id = ?').bind(id).run()
}

export async function setTags (db, id, tagsString) {
  await db.prepare('UPDATE emails SET tags = ? WHERE id = ?').bind(tagsString || null, id).run()
}

export async function getAllTags (db) {
  const { results } = await db.prepare('SELECT tags FROM emails WHERE tags IS NOT NULL').all()
  return results.map((row) => row.tags)
}

// Finds emails sitting in trash/spam whose status_changed_at is older than
// the cutoff. Callers must fetch attachment R2 keys BEFORE calling
// deleteEmailsByIds (cascade ordering).
export async function getStaleTrashSpamIds (db, cutoffTimestamp) {
  const { results } = await db
    .prepare('SELECT id FROM emails WHERE status IN (\'trash\', \'spam\') AND status_changed_at < ?')
    .bind(cutoffTimestamp)
    .all()
  return results.map((row) => row.id)
}

export async function deleteEmailsByIds (db, ids) {
  if (ids.length === 0) return
  const placeholders = ids.map(() => '?').join(',')
  await db.prepare(`DELETE FROM emails WHERE id IN (${placeholders})`).bind(...ids).run()
}

// Finds prev/next email id within the same filtered result set as the message
// being viewed - arrow-key nav respects whatever search/filter you arrived from.
export async function getAdjacentEmailId (db, filters, currentCreatedAt, currentId, direction) {
  const { conditions, params, fromClause } = buildEmailConditions(filters)

  // "Next" = newer (created_at DESC list, so next means a larger created_at).
  // Compound cursor so two emails with the same millisecond timestamp are
  // never skipped or duplicated.
  const comparison = direction === 'next' ? '>' : '<'
  const order = direction === 'next' ? 'ASC' : 'DESC'
  conditions.push(`(emails.created_at ${comparison} ? OR (emails.created_at = ? AND emails.id ${comparison} ?))`)
  params.push(currentCreatedAt, currentCreatedAt, currentId)

  const whereClause = `WHERE ${conditions.join(' AND ')}`
  const row = await db
    .prepare(`SELECT emails.id ${fromClause} ${whereClause} ORDER BY emails.created_at ${order}, emails.id ${order} LIMIT 1`)
    .bind(...params)
    .first()
  return row ? row.id : null
}

export async function getEmailByMessageId (db, messageId) {
  return db
    .prepare('SELECT id, message_id, in_reply_to FROM emails WHERE message_id = ?')
    .bind(messageId)
    .first()
}

// Walks the in_reply_to chain backward to build the full References list
// (oldest ancestor first). Falls back to the sent table when a message-id
// isn't found in inbound emails - closes the chain through our own replies.
// Bounded by maxDepth against malformed/circular chains.
export async function buildReferencesChain (db, email, maxDepth = 20) {
  const chain = []
  const seen = new Set()
  let currentInReplyTo = email.in_reply_to
  let depth = 0

  while (currentInReplyTo && depth < maxDepth) {
    if (seen.has(currentInReplyTo)) break
    seen.add(currentInReplyTo)
    chain.unshift(currentInReplyTo)
    const ancestor = await getEmailByMessageId(db, currentInReplyTo) ||
      await getSentByMessageId(db, currentInReplyTo)
    currentInReplyTo = ancestor ? ancestor.in_reply_to : null
    depth++
  }

  chain.push(email.message_id)
  return chain.filter(Boolean)
}

export async function getUnreadInboxCount (db) {
  const row = await db.prepare("SELECT COUNT(*) as count FROM emails WHERE status = 'inbox' AND read = 0").first()
  return row.count
}
