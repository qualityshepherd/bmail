export async function upsertContacts (db, contacts) {
  if (contacts.length === 0) return
  // One statement per contact — D1 caps bound parameters at 100 per query,
  // so a multi-row batch would blow up on anything larger than ~33 contacts.
  const stmt = db.prepare(
    'INSERT OR REPLACE INTO contacts (email, name, avatar_url) VALUES (?, ?, ?)'
  )
  await db.batch(contacts.map((c) => stmt.bind(c.email, c.name || '', c.avatarUrl || '')))
}

// Map<lowerCaseEmail, { name, avatarUrl }> for per-row lookup.
//
// avatarUrl is a path on our own origin, not the url in the row - that one
// is just where the photo came from once. Built here rather than at each
// render site so nothing can accidentally leak the original back into a
// page and start making third-party requests again.
export async function getContactsByEmails (db, emails) {
  const map = new Map()
  if (emails.length === 0) return map
  const unique = [...new Set(emails.map((e) => e.toLowerCase()))]
  const placeholders = unique.map(() => '?').join(', ')
  const { results } = await db.prepare(
    `SELECT email, name, avatar_url FROM contacts WHERE email IN (${placeholders})`
  ).bind(...unique).all()
  for (const row of results) {
    map.set(row.email, {
      name: row.name,
      avatarUrl: row.avatar_url ? `/avatar/${encodeURIComponent(row.email)}` : ''
    })
  }
  return map
}

// Raw row, for the avatar route - it needs the original url, not the path.
export async function getContactByEmail (db, email) {
  const { results } = await db.prepare(
    'SELECT email, name, avatar_url FROM contacts WHERE email = ?'
  ).bind(String(email || '').toLowerCase()).all()
  return results[0] || null
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

// Every photo url still spoken for, for the R2 sweep.
export async function getAllAvatarUrls (db) {
  const { results } = await db.prepare(
    "SELECT DISTINCT avatar_url FROM contacts WHERE avatar_url <> ''"
  ).all()
  return results.map((r) => r.avatar_url)
}
