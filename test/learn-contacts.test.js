import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTestDb } from './helpers/d1-sqlite.js'
import { upsertContacts, learnContacts, fillContactName, getContactByEmail, getAllContactRows } from '../src/db-contacts.js'
import { peopleFromSend, toVCards, parseVCards } from '../src/contacts.js'
import { isMailProvider, findTouchIcon, avatarKey } from '../src/avatars.js'
import { learnFromSend } from '../src/learn-contacts.js'

const bucket = () => {
  const objects = new Map()
  return {
    objects,
    async head (key) { return objects.has(key) ? { key } : null },
    async put (key, body, opts) { objects.set(key, { body, opts }) }
  }
}

async function withFetch (impl, fn) {
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => { calls.push(String(url)); return impl(String(url), init) }
  try { return await fn(calls) } finally { globalThis.fetch = original }
}

const png = () => new Response(new Uint8Array(32), { status: 200, headers: { 'content-type': 'image/png' } })
const html = (body) => new Response(body, { status: 200, headers: { 'content-type': 'text/html' } })
const notFound = () => new Response('nope', { status: 404 })

// who a send is about

test('peopleFromSend: a typed name is typed, a bare address has no name', () => {
  const people = peopleFromSend({ to: ['K Trout <Kilgore@Trout.fish>', 'bare@x.org'] })
  assert.deepEqual(people, [
    { email: 'kilgore@trout.fish', name: 'K Trout', typed: true },
    { email: 'bare@x.org', name: '', typed: false }
  ])
})

test('peopleFromSend: a reply borrows the From name of the mail it answers, as a fill', () => {
  const repliedTo = { sender: 'bounce@lists.manu.com', from_address: 'hello@manuelmoreale.com', sender_display: 'Manuel Moreale' }
  const [p] = peopleFromSend({ to: ['hello@manuelmoreale.com'], repliedTo })
  assert.deepEqual(p, { email: 'hello@manuelmoreale.com', name: 'Manuel Moreale', typed: false })
})

test('peopleFromSend: cc counts, own addresses and repeats do not', () => {
  const people = peopleFromSend({ to: ['a@x.org', 'me@brine.dev'], cc: ['"Bee, B" <b@y.org>', 'A@x.org'], own: ['Me@Brine.dev'] })
  assert.deepEqual(people.map((p) => p.email), ['a@x.org', 'b@y.org'])
  assert.equal(people[1].name, 'Bee, B')
})

// the overwrite rules

test('learnContacts: new people get added and reported as new', async () => {
  const db = createTestDb()
  const added = await learnContacts(db, [{ email: 'k@trout.fish', name: 'K Trout', typed: true }])
  assert.deepEqual(added, ['k@trout.fish'])
  assert.equal((await getContactByEmail(db, 'k@trout.fish')).name, 'K Trout')
  assert.deepEqual(await learnContacts(db, [{ email: 'k@trout.fish', name: '', typed: false }]), [])
})

test('learnContacts: a typed name replaces the old one; a bare address leaves it alone', async () => {
  const db = createTestDb()
  await upsertContacts(db, [{ email: 'k@trout.fish', name: 'Kilgore Trout' }])
  await learnContacts(db, [{ email: 'k@trout.fish', name: '', typed: false }])
  assert.equal((await getContactByEmail(db, 'k@trout.fish')).name, 'Kilgore Trout')
  await learnContacts(db, [{ email: 'k@trout.fish', name: 'K Trout', typed: true }])
  assert.equal((await getContactByEmail(db, 'k@trout.fish')).name, 'K Trout')
})

test('learnContacts: a borrowed From name fills a blank but never replaces', async () => {
  const db = createTestDb()
  await upsertContacts(db, [{ email: 'a@x.org', name: '' }, { email: 'b@x.org', name: 'Bee' }])
  await learnContacts(db, [{ email: 'a@x.org', name: 'Ay', typed: false }, { email: 'b@x.org', name: 'Not Bee', typed: false }])
  assert.equal((await getContactByEmail(db, 'a@x.org')).name, 'Ay')
  assert.equal((await getContactByEmail(db, 'b@x.org')).name, 'Bee')
})

test('fillContactName: incoming mail fills a blank, never replaces, never creates', async () => {
  const db = createTestDb()
  await upsertContacts(db, [{ email: 'a@x.org', name: '' }, { email: 'b@x.org', name: 'Bee' }])
  await fillContactName(db, 'A@x.org', 'Ay')
  await fillContactName(db, 'b@x.org', 'Spoofed')
  await fillContactName(db, 'stranger@x.org', 'Stranger')
  assert.equal((await getContactByEmail(db, 'a@x.org')).name, 'Ay')
  assert.equal((await getContactByEmail(db, 'b@x.org')).name, 'Bee')
  assert.equal(await getContactByEmail(db, 'stranger@x.org'), null)
})

test('upsertContacts: an import overwrites, but its blanks erase nothing', async () => {
  const db = createTestDb()
  await upsertContacts(db, [{ email: 'a@x.org', name: 'Old', avatarUrl: 'https://x.org/icon.png' }])
  await upsertContacts(db, [{ email: 'a@x.org', name: 'New', avatarUrl: '' }])
  const row = await getContactByEmail(db, 'a@x.org')
  assert.equal(row.name, 'New')
  assert.equal(row.avatar_url, 'https://x.org/icon.png')
  await upsertContacts(db, [{ email: 'a@x.org', name: '' }])
  assert.equal((await getContactByEmail(db, 'a@x.org')).name, 'New')
})

// touch icons

test('isMailProvider: big hosts and their country spellings, not personal domains', () => {
  for (const d of ['gmail.com', 'icloud.com', 'yahoo.co.uk', 'hotmail.fr', 'gmx.de', 'proton.me']) assert.ok(isMailProvider(d), d)
  for (const d of ['manuelmoreale.com', 'trout.fish', 'me.brine.dev', 'mail.example.org']) assert.ok(!isMailProvider(d), d)
})

test('findTouchIcon: the declared icon first, then the usual path; mail hosts get nothing', async () => {
  const page = html('<head><link href="/img/face.png" rel="apple-touch-icon" sizes="180x180"></head>')
  const urls = await findTouchIcon('trout.fish', async () => page)
  assert.deepEqual(urls, ['https://trout.fish/img/face.png', 'https://trout.fish/apple-touch-icon.png'])
  assert.deepEqual(await findTouchIcon('gmail.com', async () => { throw new Error('fetched') }), [])
  assert.deepEqual(await findTouchIcon('down.org', async () => { throw new Error('timeout') }), ['https://down.org/apple-touch-icon.png'])
})

test('learnFromSend: a new contact on its own domain gets its touch icon stored', async () => {
  const env = { DB: createTestDb(), ATTACHMENTS: bucket() }
  await withFetch((url) => url === 'https://trout.fish/' ? html('<link rel="apple-touch-icon" href="/t.png">') : png(), async () => {
    await learnFromSend(env, { to: ['K Trout <k@trout.fish>'] })
  })
  const row = await getContactByEmail(env.DB, 'k@trout.fish')
  assert.equal(row.avatar_url, 'https://trout.fish/t.png')
  assert.ok(env.ATTACHMENTS.objects.has(await avatarKey(row.avatar_url)))
})

test('learnFromSend: no icon anywhere means no avatar url, so initials show', async () => {
  const env = { DB: createTestDb(), ATTACHMENTS: bucket() }
  await withFetch(() => notFound(), async () => {
    await learnFromSend(env, { to: ['k@trout.fish'] })
  })
  assert.equal((await getContactByEmail(env.DB, 'k@trout.fish')).avatar_url, '')
})

test('learnFromSend: gmail and known contacts never fetch anything', async () => {
  const env = { DB: createTestDb(), ATTACHMENTS: bucket() }
  await upsertContacts(env.DB, [{ email: 'known@trout.fish', name: 'Known' }])
  await withFetch(() => png(), async (calls) => {
    await learnFromSend(env, { to: ['someone@gmail.com', 'known@trout.fish'] })
    assert.deepEqual(calls, [])
  })
  assert.ok(await getContactByEmail(env.DB, 'someone@gmail.com'))
})

// export

test('toVCards: round-trips through the importer, escaping and photo url included', async () => {
  const db = createTestDb()
  await upsertContacts(db, [
    { email: 'a@x.org', name: 'Trout, Kilgore; Esq.', avatarUrl: 'https://x.org/a.png' },
    { email: 'b@y.org', name: '' }
  ])
  const vcf = toVCards(await getAllContactRows(db))
  assert.ok(vcf.includes('FN:Trout\\, Kilgore\\; Esq.'))
  assert.ok(vcf.includes('PHOTO;VALUE=URI:https://x.org/a.png'))
  const back = parseVCards(vcf)
  assert.deepEqual(back.map((c) => c.email).sort(), ['a@x.org', 'b@y.org'])
  const a = back.find((c) => c.email === 'a@x.org')
  assert.equal(a.name, 'Trout, Kilgore; Esq.')
  assert.equal(a.avatarUrl, 'https://x.org/a.png')
  // a nameless contact comes back nameless, not named after its address
  assert.equal(back.find((c) => c.email === 'b@y.org').name, '')
})

test('toVCards: no contacts is an empty file', () => {
  assert.equal(toVCards([]), '')
})
