// Real SQLite, real migrations, no mocks. The stuff you can't verify by
// just reading the SQL: does retention actually leave Inbox/Archive alone,
// does FTS5 stay in sync, does a real dupe error look like what we check
// for, does a nonce actually die after one use.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTestDb } from './helpers/d1-sqlite.js'
import { insertEmail, setStatus, searchEmails, getStaleTrashSpamIds, isDuplicateKeyError } from '../src/db-email.js'
import { insertAttachment, getStaleAttachments } from '../src/db-attachments.js'
import { insertNonce, consumeNonce } from '../src/db-auth.js'

const baseEmail = { sender: 'a@example.com', recipient: 'me@example.com', subject: 'hi', body: 'hello' }

// — getStaleTrashSpamIds: the one query that decides what gets permanently deleted —

test('getStaleTrashSpamIds: never matches Inbox, no matter how old', async () => {
  const db = createTestDb()
  const id = await insertEmail(db, { ...baseEmail, createdAt: 1 }) // ancient
  // status defaults to 'inbox'; status_changed_at defaults to createdAt (also ancient)
  const stale = await getStaleTrashSpamIds(db, Date.now())
  assert.deepEqual(stale, [], `inbox email ${id} must never be purge-eligible`)
})

test('getStaleTrashSpamIds: never matches Archive, no matter how old', async () => {
  const db = createTestDb()
  const id = await insertEmail(db, { ...baseEmail, createdAt: 1 })
  await setStatus(db, id, 'archive', 1)
  const stale = await getStaleTrashSpamIds(db, Date.now())
  assert.deepEqual(stale, [], `archive email ${id} must never be purge-eligible`)
})

test('getStaleTrashSpamIds: matches Trash past the cutoff', async () => {
  const db = createTestDb()
  const id = await insertEmail(db, { ...baseEmail, createdAt: Date.now() })
  await setStatus(db, id, 'trash', 1) // moved to trash "long ago"
  const stale = await getStaleTrashSpamIds(db, Date.now())
  assert.deepEqual(stale, [id])
})

test('getStaleTrashSpamIds: matches Spam past the cutoff', async () => {
  const db = createTestDb()
  const id = await insertEmail(db, { ...baseEmail, createdAt: Date.now(), status: 'spam' })
  await setStatus(db, id, 'spam', 1)
  const stale = await getStaleTrashSpamIds(db, Date.now())
  assert.deepEqual(stale, [id])
})

test('getStaleTrashSpamIds: does NOT match Trash/Spam that moved there recently', async () => {
  const db = createTestDb()
  const id = await insertEmail(db, { ...baseEmail, createdAt: Date.now() })
  await setStatus(db, id, 'trash', Date.now()) // moved to trash just now
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000 // 30 days ago
  const stale = await getStaleTrashSpamIds(db, cutoff)
  assert.deepEqual(stale, [])
})

test('getStaleTrashSpamIds: uses status_changed_at, not created_at - an old email freshly trashed is not yet stale', async () => {
  const db = createTestDb()
  const id = await insertEmail(db, { ...baseEmail, createdAt: 1 }) // email itself is ancient
  await setStatus(db, id, 'trash', Date.now()) // but just moved to trash
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
  const stale = await getStaleTrashSpamIds(db, cutoff)
  assert.deepEqual(stale, [], 'the email\'s own age must not matter, only time since the status change')
})

test('getStaleTrashSpamIds: a mix of statuses only returns the stale trash/spam ones', async () => {
  const db = createTestDb()
  const inboxId = await insertEmail(db, { ...baseEmail, createdAt: 1 })
  const archiveId = await insertEmail(db, { ...baseEmail, createdAt: 1 })
  await setStatus(db, archiveId, 'archive', 1)
  const staleTrashId = await insertEmail(db, { ...baseEmail, createdAt: Date.now() })
  await setStatus(db, staleTrashId, 'trash', 1)
  const freshTrashId = await insertEmail(db, { ...baseEmail, createdAt: Date.now() })
  await setStatus(db, freshTrashId, 'trash', Date.now())

  const stale = await getStaleTrashSpamIds(db, Date.now() - 1000)
  assert.deepEqual(stale, [staleTrashId])
  assert.ok(!stale.includes(inboxId) && !stale.includes(archiveId) && !stale.includes(freshTrashId))
})

// — getStaleAttachments: ages out by the PARENT EMAIL's arrival, regardless of status —

test('getStaleAttachments: matches an attachment whose parent email is older than cutoff, regardless of status', async () => {
  const db = createTestDb()
  const id = await insertEmail(db, { ...baseEmail, createdAt: 1 }) // old arrival, still in Inbox
  await insertAttachment(db, { emailId: id, filename: 'f.pdf', contentType: 'application/pdf', r2Key: 'attachments/1/abc', size: 100 })
  const stale = await getStaleAttachments(db, Date.now())
  assert.equal(stale.length, 1)
  assert.equal(stale[0].r2_key, 'attachments/1/abc')
})

test('getStaleAttachments: does not match a recent email\'s attachment', async () => {
  const db = createTestDb()
  const id = await insertEmail(db, { ...baseEmail, createdAt: Date.now() })
  await insertAttachment(db, { emailId: id, filename: 'f.pdf', contentType: 'application/pdf', r2Key: 'attachments/1/abc', size: 100 })
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
  assert.deepEqual(await getStaleAttachments(db, cutoff), [])
})

// — FTS5: the search index actually has to stay in sync with the table —

test('FTS5 trigger: a newly inserted email is immediately searchable', async () => {
  const db = createTestDb()
  await insertEmail(db, { ...baseEmail, subject: 'Quarterly invoice', body: 'see attached', createdAt: Date.now() })
  const results = await searchEmails(db, { all: true, tags: [], text: 'invoice' })
  assert.equal(results.length, 1)
})

test('FTS5 trigger: searching for a word that only appears in the body still finds it', async () => {
  const db = createTestDb()
  await insertEmail(db, { ...baseEmail, subject: 'Hello', body: 'the quarterly numbers are attached', createdAt: Date.now() })
  const results = await searchEmails(db, { all: true, tags: [], text: 'quarterly' })
  assert.equal(results.length, 1)
})

test('FTS5 trigger: an unrelated word does not match', async () => {
  const db = createTestDb()
  await insertEmail(db, { ...baseEmail, subject: 'Hello', body: 'nothing relevant here', createdAt: Date.now() })
  const results = await searchEmails(db, { all: true, tags: [], text: 'invoice' })
  assert.equal(results.length, 0)
})

// — Duplicate email guard: does a real dupe error actually match what
// isDuplicateKeyError checks for, not just a fake one we typed up —

test('insertEmail: a second email with the same message_id throws a real unique-constraint error that isDuplicateKeyError recognizes', async () => {
  const db = createTestDb()
  await insertEmail(db, { ...baseEmail, messageId: '<dup@example.com>', createdAt: Date.now() })
  await assert.rejects(
    insertEmail(db, { ...baseEmail, messageId: '<dup@example.com>', createdAt: Date.now() }),
    (err) => isDuplicateKeyError(err)
  )
})

test('insertEmail: different message_ids never collide', async () => {
  const db = createTestDb()
  await insertEmail(db, { ...baseEmail, messageId: '<a@example.com>', createdAt: Date.now() })
  await assert.doesNotReject(insertEmail(db, { ...baseEmail, messageId: '<b@example.com>', createdAt: Date.now() }))
})

test('insertEmail: a null message_id never collides with itself (partial unique index, not a plain one)', async () => {
  const db = createTestDb()
  await insertEmail(db, { ...baseEmail, messageId: null, createdAt: Date.now() })
  await assert.doesNotReject(insertEmail(db, { ...baseEmail, messageId: null, createdAt: Date.now() }))
})

// — Nonce single-use: proves the logic is right sequentially. Does NOT
// prove the concurrency claim in db-auth.js - that needs real parallel
// requests, not this single-connection harness —

test('consumeNonce: a fresh nonce is consumed and returns its createdAt', async () => {
  const db = createTestDb()
  await insertNonce(db, 'abc123', 1000)
  assert.equal(await consumeNonce(db, 'abc123'), 1000)
})

test('consumeNonce: consuming the same nonce a second time returns null, not the same value again', async () => {
  const db = createTestDb()
  await insertNonce(db, 'abc123', 1000)
  await consumeNonce(db, 'abc123')
  assert.equal(await consumeNonce(db, 'abc123'), null)
})

test('consumeNonce: an unknown nonce returns null', async () => {
  const db = createTestDb()
  assert.equal(await consumeNonce(db, 'never-issued'), null)
})
