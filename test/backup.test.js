import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sqlVal, runManualBackup } from '../src/backup.js'

test('sqlVal: null → NULL', () => {
  assert.equal(sqlVal(null), 'NULL')
})

test('sqlVal: undefined → NULL', () => {
  assert.equal(sqlVal(undefined), 'NULL')
})

test('sqlVal: integer → bare number', () => {
  assert.equal(sqlVal(42), '42')
})

test('sqlVal: zero → bare number', () => {
  assert.equal(sqlVal(0), '0')
})

test('sqlVal: float → bare number', () => {
  assert.equal(sqlVal(3.14), '3.14')
})

test('sqlVal: true → 1', () => {
  assert.equal(sqlVal(true), '1')
})

test('sqlVal: false → 0', () => {
  assert.equal(sqlVal(false), '0')
})

test('sqlVal: plain string → single-quoted', () => {
  assert.equal(sqlVal('hello'), "'hello'")
})

test('sqlVal: string with single quote → doubled', () => {
  assert.equal(sqlVal("it's"), "'it''s'")
})

test('sqlVal: string with multiple single quotes → all doubled', () => {
  assert.equal(sqlVal("it's a dog's life"), "'it''s a dog''s life'")
})

test('sqlVal: empty string → empty quoted string', () => {
  assert.equal(sqlVal(''), "''")
})

test('sqlVal: string with SQL injection attempt → safely quoted', () => {
  assert.equal(sqlVal("'; DROP TABLE emails; --"), "'''; DROP TABLE emails; --'")
})

test('manual backup includes all persistent tables and current email columns', async () => {
  const queries = []
  let savedKey = null
  let savedSql = ''
  const rowsByTable = {
    emails: [{
      id: 7,
      sender: 'list@example.com',
      recipient: 'me@example.net',
      subject: 'hello',
      body: 'body',
      message_id: '<abc@example.com>',
      in_reply_to: null,
      created_at: 1,
      sender_display: null,
      starred: 0,
      status: 'inbox',
      status_changed_at: 0,
      read: 0,
      tags: null,
      cc: null,
      list_unsubscribe: '<https://example.com/unsub>',
      list_unsubscribe_post: 'List-Unsubscribe=One-Click',
      dmarc_result: 'pass'
    }],
    attachments: [],
    sent: [],
    blocklist: [],
    spamlist: [{ id: 3, pattern: '*@spam.example' }],
    known_recipients: [{ address: 'friend@example.net', first_seen: 123 }],
    contacts: [],
    settings: []
  }
  const env = {
    DB: {
      prepare (query) {
        queries.push(query)
        return { all: async () => ({ results: rowsByTable[query.match(/FROM (\w+)/)[1]] || [] }) }
      }
    },
    ATTACHMENTS: {
      put: async (key, value) => { savedKey = key; savedSql = value }
    }
  }

  await runManualBackup(env)

  assert.match(savedKey, /^backups\/bmail-\d{4}-\d{2}-\d{2}\.sql$/)
  assert.match(savedSql, /INSERT INTO emails \(id, sender, recipient, subject, body, message_id, in_reply_to, created_at, sender_display, starred, status, status_changed_at, read, tags, cc, list_unsubscribe, list_unsubscribe_post, dmarc_result\)/)
  assert.match(savedSql, /INSERT INTO spamlist \(id, pattern\) VALUES \(3, '\*@spam\.example'\);/)
  assert.match(savedSql, /INSERT INTO known_recipients \(address, first_seen\) VALUES \('friend@example\.net', 123\);/)
  assert.match(savedSql, /'List-Unsubscribe=One-Click'/)
  assert.match(savedSql, /D1 data only: attachment blobs are stored separately in R2 and are not included/)
  assert.ok(queries.some(q => q.includes('FROM spamlist')))
  assert.ok(queries.some(q => q.includes('FROM known_recipients')))
})
