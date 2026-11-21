// vCard import: you, on purpose, so it wins - but a blank in the file
// never erases a name or photo bmail already has.
// One statement per contact - D1 caps bound parameters at 100 per query,
// so a multi-row batch would blow up on anything larger than ~33 contacts.
export async function upsertContacts (db, contacts) {
  if (contacts.length === 0) return
  const stmt = db.prepare(`
    INSERT INTO contacts (email, name, avatar_url) VALUES (?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      name = CASE WHEN excluded.name <> '' THEN excluded.name ELSE contacts.name END,
      avatar_url = CASE WHEN excluded.avatar_url <> '' THEN excluded.avatar_url ELSE contacts.avatar_url END
  `)
  await db.batch(contacts.map((c) => stmt.bind(c.email, c.name || '', c.avatarUrl || '')))
}

// From a send: everyone you wrote to is a contact. A name you typed wins
// (you'd only type one to fix it); a name from their own From line only
// fills a blank. Returns the addresses that weren't contacts before.
export async function learnContacts (db, people) {
  if (people.length === 0) return []
  const known = await getContactsByEmails(db, people.map((p) => p.email))
  const stmt = db.prepare(`
    INSERT INTO contacts (email, name, avatar_url) VALUES (?, ?, '')
    ON CONFLICT(email) DO UPDATE SET
      name = CASE
        WHEN ? = 1 AND excluded.name <> '' THEN excluded.name
        WHEN contacts.name = '' THEN excluded.name
        ELSE contacts.name END
  `)
  await db.batch(people.map((p) => stmt.bind(p.email, p.name || '', p.typed ? 1 : 0)))
  return people.map((p) => p.email).filter((e) => !known.has(e))
}

// Incoming mail never makes a contact - it can only fill a blank name.
export async function fillContactName (db, email, name) {
  if (!email || !name) return
  await db.prepare("UPDATE contacts SET name = ? WHERE email = ? AND name = ''")
    .bind(name, String(email).trim().toLowerCase()).run()
}

export async function fillContactAvatar (db, email, url) {
  await db.prepare("UPDATE contacts SET avatar_url = ? WHERE email = ? AND avatar_url = ''")
    .bind(url, email).run()
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

// Full rows, for the vCard export
export async function getAllContactRows (db) {
  const { results } = await db.prepare('SELECT email, name, avatar_url FROM contacts ORDER BY name, email').all()
  return results
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
