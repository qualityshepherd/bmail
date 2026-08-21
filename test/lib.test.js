import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { patternMatches, anyPatternMatches } from '../src/match.js'
import { buildSmsPayload } from '../src/notifications.js'
import { stripHtml, parseRawEmail, formatSenderDisplay } from '../src/mime.js'
import { parseHttpUrl } from '../src/unsubscribe-handler.js'

test('patternMatches: exact address match', () => {
  assert.equal(patternMatches('alice@example.com', 'alice@example.com'), true)
  assert.equal(patternMatches('alice@example.com', 'bob@example.com'), false)
})

test('patternMatches: case-insensitive', () => {
  assert.equal(patternMatches('Alice@Example.com', 'alice@example.com'), true)
})

test('patternMatches: domain wildcard', () => {
  assert.equal(patternMatches('*@spam.com', 'anything@spam.com'), true)
  assert.equal(patternMatches('*@spam.com', 'anything@notspam.com'), false)
})

test('patternMatches: bare domain matches exact domain and subdomains', () => {
  assert.equal(patternMatches('therundown.ai', 'foo@therundown.ai'), true)
  assert.equal(patternMatches('therundown.ai', 'foo@em8370.daily.therundown.ai'), true)
  assert.equal(patternMatches('therundown.ai', 'foo@nottherundown.ai'), false)
  assert.equal(patternMatches('mcdlv.net', 'bounce@mail130.suw14.mcdlv.net'), true)
  assert.equal(patternMatches('mcdlv.net', 'foo@notmcdlv.net'), false)
})

test('anyPatternMatches: matches if any pattern hits', () => {
  const patterns = ['alice@example.com', '*@spam.com']
  assert.equal(anyPatternMatches(patterns, 'bad@spam.com'), true)
  assert.equal(anyPatternMatches(patterns, 'ok@example.com'), false)
})

test('buildSmsPayload: plural unread', () => {
  const payload = buildSmsPayload({ unreadCount: 3 })
  assert.equal(payload, 'Bmail: you have 3 unread emails')
})

test('buildSmsPayload: singular unread', () => {
  const payload = buildSmsPayload({ unreadCount: 1 })
  assert.equal(payload, 'Bmail: you have 1 unread email')
})

test('stripHtml: strips tags and collapses block elements to newlines', () => {
  const html = '<html><body><p>Hi there,</p><p>This is <b>bold</b>.</p></body></html>'
  const text = stripHtml(html)
  assert.equal(text.includes('<'), false)
  assert.match(text, /Hi there,/)
  assert.match(text, /This is bold\./)
})

test('parseRawEmail: parses fixture multipart/alternative message', async () => {
  const fixturePath = fileURLToPath(new URL('./fixtures/simple-alternative.eml', import.meta.url))
  const raw = await readFile(fixturePath)
  const parsed = await parseRawEmail(raw)

  assert.equal(parsed.subject, 'Hello from the fixture corpus')
  assert.equal(parsed.messageId, '<fixture-1@example.com>')
  assert.match(parsed.text, /plain text part/)
  assert.match(parsed.html, /<b>HTML<\/b>/)
  assert.equal(parsed.attachments.length, 0)
})

// formatSenderDisplay - display-only, never used for security decisions
// (see the comment in mime.js on why blocklist/allowlist stays on the
// envelope sender instead). Returns bare NAME only now, not "Name <addr>" -
// the address already lives separately in the envelope `sender` column.
test('formatSenderDisplay: returns just the name when present', () => {
  const result = formatSenderDisplay({ name: 'Jane Doe', address: 'jane@example.com' })
  assert.equal(result, 'Jane Doe')
})

test('formatSenderDisplay: no name returns null (not the address)', () => {
  const result = formatSenderDisplay({ name: '', address: 'jane@example.com' })
  assert.equal(result, null)
})

test('formatSenderDisplay: missing from object returns null', () => {
  assert.equal(formatSenderDisplay(null), null)
  assert.equal(formatSenderDisplay(undefined), null)
})

test('formatSenderDisplay: name present but no address still returns the name', () => {
  // Display purposes only - it's fine to show a name even without an
  // address to pair it with, unlike the old version which required both.
  assert.equal(formatSenderDisplay({ name: 'Jane Doe' }), 'Jane Doe')
})

test('parseRawEmail: fixture without a display name falls back to bare address', async () => {
  const fixturePath = fileURLToPath(new URL('./fixtures/simple-alternative.eml', import.meta.url))
  const raw = await readFile(fixturePath)
  const parsed = await parseRawEmail(raw)
  // fixture From is "Alice Example <alice@example.com>" - has a name
  assert.equal(parsed.senderDisplay, 'Alice Example')
})

test('parseHttpUrl: extracts https URL from angle-bracket header', () => {
  assert.equal(
    parseHttpUrl('<https://example.com/unsub>, <mailto:unsub@example.com>'),
    'https://example.com/unsub'
  )
})

test('parseHttpUrl: returns null when no http URL present', () => {
  assert.equal(parseHttpUrl('<mailto:unsub@example.com>'), null)
  assert.equal(parseHttpUrl(''), null)
})

test('parseHttpUrl: ignores bare URLs without angle brackets', () => {
  assert.equal(parseHttpUrl('https://example.com/unsub'), null)
})
