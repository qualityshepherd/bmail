import { getSetting } from './db-admin.js'

export async function upsertContacts (db, contacts) {
  if (contacts.length === 0) return
  // One statement per contact — D1 caps bound parameters at 100 per query,
  // so a multi-row batch would blow up on anything larger than ~33 contacts.
  const stmt = db.prepare(
    'INSERT OR REPLACE INTO contacts (email, name, avatar_url) VALUES (?, ?, ?)'
  )
  await db.batch(contacts.map((c) => stmt.bind(c.email, c.name || '', c.avatarUrl || '')))
}

// Returns a Map<lowerCaseEmail, { name, avatarUrl }> for efficient per-row lookup.
// Remote avatar URLs are opt-in (off by default) - just viewing a message
// from a contact would otherwise cause the browser to fetch whatever host
// they put in their avatar field. Checked here, once, rather than at every
// one of the many render call sites, so callers get correct behavior with
// no changes needed on their end.
export async function getContactsByEmails (db, emails) {
  const map = new Map()
  if (emails.length === 0) return map
  const showRemoteAvatars = (await getSetting(db, 'showRemoteAvatars')) === 'on'
  const unique = [...new Set(emails.map((e) => e.toLowerCase()))]
  const placeholders = unique.map(() => '?').join(', ')
  const { results } = await db.prepare(
    `SELECT email, name, avatar_url FROM contacts WHERE email IN (${placeholders})`
  ).bind(...unique).all()
  for (const row of results) {
    map.set(row.email, { name: row.name, avatarUrl: showRemoteAvatars ? row.avatar_url : '' })
  }
  return map
}

export async function getAllContacts (db) {
  const { results } = await db.prepare('SELECT email, name FROM contacts ORDER BY name, email').all()
  return results
}

export async function getAllContactsCount (db) {
  const { results } = await db.prepare('SELECT COUNT(*) as n FROM contacts').all()
  return results[0]?.n ?? 0
}

export async function deleteAllContacts (db) {
  await db.prepare('DELETE FROM contacts').run()
}
