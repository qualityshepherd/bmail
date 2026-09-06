import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { patternMatches, anyPatternMatches } from '../src/match.js'
import { classifySmsNotification, buildNewMailSmsPayload, buildSmsPauseWarning, SMS_NOTIFICATION_MAX_PER_WINDOW } from '../src/notifications.js'
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

test('patternMatches: glob *pattern* matches full From header', () => {
  assert.equal(patternMatches('*Good Sense RV*', 'bounces@em5143.aem-irv.com', 'Good Sense RV <bounces@em5143.aem-irv.com>'), true)
  assert.equal(patternMatches('*Good Sense RV*', 'bounces@em5143.aem-irv.com', 'Bad Actor <bounces@em5143.aem-irv.com>'), false)
  assert.equal(patternMatches('*brine.dev*', 'bounces+junk=brine.dev@em5143.aem-irv.com', 'Good Sense RV <bounces+junk=brine.dev@em5143.aem-irv.com>'), true)
})

test('patternMatches: glob falls back to envelope if no fullFrom', () => {
  assert.equal(patternMatches('*brine.dev*', 'bounces+junk=brine.dev@em5143.aem-irv.com'), true)
  assert.equal(patternMatches('*brine.dev*', 'bounces@em5143.aem-irv.com'), false)
})

// classifySmsNotification
test('classifySmsNotification: sends normally at and under the cap', () => {
  for (let count = 1; count <= SMS_NOTIFICATION_MAX_PER_WINDOW; count++) {
    assert.equal(classifySmsNotification(count), 'send')
  }
})

test('classifySmsNotification: warns exactly once, on the first count past the cap', () => {
  assert.equal(classifySmsNotification(SMS_NOTIFICATION_MAX_PER_WINDOW + 1), 'warn')
})

test('classifySmsNotification: suppresses everything after the warning', () => {
  assert.equal(classifySmsNotification(SMS_NOTIFICATION_MAX_PER_WINDOW + 2), 'suppress')
  assert.equal(classifySmsNotification(SMS_NOTIFICATION_MAX_PER_WINDOW + 10), 'suppress')
})

// buildNewMailSmsPayload
test('buildNewMailSmsPayload: includes sender and subject', () => {
  const payload = buildNewMailSmsPayload({ sender: 'alice@example.com', subject: 'Hello' })
  assert.equal(payload, 'Bmail: alice@example.com - Hello')
})

test('buildNewMailSmsPayload: strips URLs from sender/subject', () => {
  const payload = buildNewMailSmsPayload({ sender: 'spam@example.com', subject: 'Click https://evil.example/x now' })
  assert.equal(payload, 'Bmail: spam@example.com - Click now')
})

test('buildNewMailSmsPayload: folds accented characters to plain ASCII', () => {
  const payload = buildNewMailSmsPayload({ sender: 'José García', subject: 'café meetup' })
  assert.equal(payload, 'Bmail: Jose Garcia - cafe meetup')
})

test('buildNewMailSmsPayload: strips characters with no ASCII equivalent (emoji)', () => {
  const payload = buildNewMailSmsPayload({ sender: 'friend@example.com', subject: '🎉 party time' })
  assert.equal(payload, 'Bmail: friend@example.com - party time')
})

test('buildNewMailSmsPayload: truncates long fields', () => {
  const longSubject = 'x'.repeat(200)
  const payload = buildNewMailSmsPayload({ sender: 'a@example.com', subject: longSubject })
  assert.equal(payload, `Bmail: a@example.com - ${'x'.repeat(60)}`)
})

test('buildNewMailSmsPayload: falls back for missing fields', () => {
  const payload = buildNewMailSmsPayload({ sender: '', subject: '' })
  assert.equal(payload, 'Bmail: unknown sender - (no subject)')
})

// buildSmsPauseWarning
test('buildSmsPauseWarning: mentions the window length', () => {
  assert.equal(buildSmsPauseWarning(), 'Bmail: high volume of new mail - pausing notifications for 60 min')
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
