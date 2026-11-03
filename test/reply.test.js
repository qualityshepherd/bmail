import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  sanitizeHeaderValue, buildReplySubject, buildReplyMimeMessage,
  generateMessageId, extractDomain, buildQuotedReplyText,
  resolveReplyTo, replyToDiffers
} from '../src/reply.js'
import { parseRawEmail } from '../src/mime.js'

// Builds the same row shape insertEmail/getEmailById deal in, but from a
// real .eml through the real parser - no hand-written reply_to values.
async function rowFromFixture (name, recipient = 'inbox@bmail.example.com') {
  const raw = await readFile(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)))
  const parsed = await parseRawEmail(raw)
  return {
    sender: name === 'craigslist-reply.eml' ? 'no-reply@craigslist.org' : 'alice@example.com',
    recipient,
    subject: parsed.subject,
    body: parsed.text,
    message_id: parsed.messageId,
    cc: parsed.cc,
    reply_to: parsed.replyTo,
    from_address: parsed.fromAddress
  }
}

// resolveReplyTo - the craigslist bug
test('resolveReplyTo: craigslist fixture resolves to the anonymized address, not the From', async () => {
  const email = await rowFromFixture('craigslist-reply.eml')
  assert.equal(resolveReplyTo(email), '7a3f91c20e4d3b8a9f1e@reply.craigslist.org')
  assert.notEqual(resolveReplyTo(email), email.sender)
})

test('resolveReplyTo: no Reply-To falls back to the sender', async () => {
  const email = await rowFromFixture('simple-alternative.eml')
  assert.equal(email.reply_to, null)
  assert.equal(resolveReplyTo(email), 'alice@example.com')
})

test('resolveReplyTo: keeps a multi-address Reply-To list intact', () => {
  const email = { sender: 'bounce@list.example', reply_to: 'A <a@example.com>, b@example.com' }
  assert.equal(resolveReplyTo(email), 'A <a@example.com>, b@example.com')
})

test('resolveReplyTo: garbage Reply-To falls back to the sender', () => {
  assert.equal(resolveReplyTo({ sender: 'real@example.com', reply_to: 'not-an-address' }), 'real@example.com')
  assert.equal(resolveReplyTo({ sender: 'real@example.com', reply_to: '' }), 'real@example.com')
})

test('resolveReplyTo: never returns undefined', () => {
  assert.equal(resolveReplyTo(null), '')
  assert.equal(resolveReplyTo({}), '')
})

// The real bug: no Reply-To header at all, but the envelope sender (used
// for blocklist matching) isn't the same address as the header From (the
// one a human should actually reply to). Bounce-safe senders do this on
// purpose - craigslist included.
test('resolveReplyTo: no Reply-To, envelope and header From differ - uses header From', () => {
  const email = {
    sender: 'bounce-anon-me=brine.dev@reply.craigslist.org', // envelope
    from_address: 'rcc9la26d7534400a6a03514c34f9200@reply.craigslist.org', // header From
    reply_to: null
  }
  assert.equal(resolveReplyTo(email), 'rcc9la26d7534400a6a03514c34f9200@reply.craigslist.org')
})

test('resolveReplyTo: Reply-To still beats header From when both are present', () => {
  const email = {
    sender: 'bounce@example.org',
    from_address: 'from-header@example.org',
    reply_to: 'actual-human@example.org'
  }
  assert.equal(resolveReplyTo(email), 'actual-human@example.org')
})

test('resolveReplyTo: garbage header From falls through to the envelope sender', () => {
  assert.equal(resolveReplyTo({ sender: 'real@example.com', from_address: 'not-an-address' }), 'real@example.com')
  assert.equal(resolveReplyTo({ sender: 'real@example.com', from_address: null }), 'real@example.com')
})

// replyToDiffers - drives the "replies go to ..." line in the message view
test('replyToDiffers: true for the craigslist fixture', async () => {
  assert.equal(replyToDiffers(await rowFromFixture('craigslist-reply.eml')), true)
})

test('replyToDiffers: false with no Reply-To', async () => {
  assert.equal(replyToDiffers(await rowFromFixture('simple-alternative.eml')), false)
})

test('replyToDiffers: false when Reply-To just restates the From', () => {
  assert.equal(replyToDiffers({ sender: 'alice@example.com', reply_to: 'Alice <alice@example.com>' }), false)
  assert.equal(replyToDiffers({ sender: 'alice@example.com', reply_to: 'ALICE@EXAMPLE.COM' }), false)
})

test('replyToDiffers: true when Reply-To adds a second address alongside the From', () => {
  assert.equal(replyToDiffers({ sender: 'alice@example.com', reply_to: 'alice@example.com, list@example.net' }), true)
})

test('replyToDiffers: unparseable Reply-To is not announced', () => {
  assert.equal(replyToDiffers({ sender: 'alice@example.com', reply_to: 'junk' }), false)
})

test('replyToDiffers: true when only the header From differs from the envelope (no Reply-To at all)', () => {
  const email = {
    sender: 'bounce-anon-me=brine.dev@reply.craigslist.org',
    from_address: 'rcc9la26d7534400a6a03514c34f9200@reply.craigslist.org',
    reply_to: null
  }
  assert.equal(replyToDiffers(email), true)
})

// Reply-To is attacker-controlled - it must not survive into a header line.
test('resolveReplyTo + buildReplyMimeMessage: a CRLF in Reply-To cannot inject a header', () => {
  const to = resolveReplyTo({ sender: 'x@example.com', reply_to: 'evil@example.com\r\nBcc: attacker@evil.com' })
  const msg = buildReplyMimeMessage({ from: 'me@bmail.example.com', to, subject: 'Re: Hi', body: 'no' })
  assert.equal(msg.includes('Bcc:'), false)
})

// sanitizeHeaderValue - the actual header-injection defense
test('sanitizeHeaderValue: strips CRLF', () => {
  assert.equal(sanitizeHeaderValue('hello\r\nBcc: attacker@evil.com'), 'hello  Bcc: attacker@evil.com')
})

test('sanitizeHeaderValue: strips bare LF', () => {
  assert.equal(sanitizeHeaderValue('hello\nworld'), 'hello world')
})

test('sanitizeHeaderValue: strips bare CR', () => {
  assert.equal(sanitizeHeaderValue('hello\rworld'), 'hello world')
})

test('sanitizeHeaderValue: plain text unaffected', () => {
  assert.equal(sanitizeHeaderValue('Normal subject line'), 'Normal subject line')
})

test('sanitizeHeaderValue: handles null/undefined', () => {
  assert.equal(sanitizeHeaderValue(null), '')
  assert.equal(sanitizeHeaderValue(undefined), '')
})

// buildReplySubject
test('buildReplySubject: adds Re: prefix', () => {
  assert.equal(buildReplySubject('Hello there'), 'Re: Hello there')
})

test('buildReplySubject: does not double-prefix an existing Re:', () => {
  assert.equal(buildReplySubject('Re: Hello there'), 'Re: Hello there')
})

test('buildReplySubject: case-insensitive Re: detection', () => {
  assert.equal(buildReplySubject('RE: Hello there'), 'RE: Hello there')
  assert.equal(buildReplySubject('re: Hello there'), 're: Hello there')
})

test('buildReplySubject: empty subject becomes bare Re:', () => {
  assert.equal(buildReplySubject(''), 'Re:')
  assert.equal(buildReplySubject(null), 'Re:')
})

// extractDomain
test('extractDomain: extracts domain from a normal address', () => {
  assert.equal(extractDomain('user@example.com'), 'example.com')
})

test('extractDomain: falls back to localhost for malformed input', () => {
  assert.equal(extractDomain('not-an-email'), 'localhost')
  assert.equal(extractDomain(''), 'localhost')
  assert.equal(extractDomain(null), 'localhost')
})

test('extractDomain: strips display name before extracting domain', () => {
  assert.equal(extractDomain('"John Doe" <john@example.com>'), 'example.com')
})

test('extractDomain: display name with comma does not corrupt domain', () => {
  assert.equal(extractDomain('"Smith, John" <john@example.com>'), 'example.com')
})

// generateMessageId
test('generateMessageId: wraps in angle brackets with the given domain', () => {
  const id = generateMessageId('example.com')
  assert.match(id, /^<[0-9a-f-]+@example\.com>$/)
})

test('generateMessageId: different calls produce different ids', () => {
  assert.notEqual(generateMessageId('example.com'), generateMessageId('example.com'))
})

// buildQuotedReplyText
test('buildQuotedReplyText: prefixes each body line with "> "', () => {
  const quote = buildQuotedReplyText({
    sender: 'alice@example.com',
    date: 'Jan 1, 2026',
    body: 'Line one\nLine two'
  })
  assert.match(quote, /> Line one/)
  assert.match(quote, /> Line two/)
})

test('buildQuotedReplyText: prefers senderDisplay over bare sender', () => {
  const quote = buildQuotedReplyText({
    senderDisplay: 'Alice Example <alice@example.com>',
    sender: 'alice@example.com',
    date: 'Jan 1, 2026',
    body: 'Hi'
  })
  assert.match(quote, /On Jan 1, 2026, Alice Example <alice@example\.com> wrote:/)
})

test('buildQuotedReplyText: falls back to sender when no display name', () => {
  const quote = buildQuotedReplyText({
    sender: 'alice@example.com',
    date: 'Jan 1, 2026',
    body: 'Hi'
  })
  assert.match(quote, /On Jan 1, 2026, alice@example\.com wrote:/)
})

// buildReplyMimeMessage
test('buildReplyMimeMessage: includes all core headers', () => {
  const msg = buildReplyMimeMessage({
    from: 'me@bmail.example.com',
    to: 'them@example.com',
    subject: 'Re: Hello',
    messageId: '<new123@bmail.example.com>',
    inReplyTo: '<abc123@example.com>',
    references: ['<root@example.com>', '<abc123@example.com>'],
    body: 'Thanks!'
  })
  assert.match(msg, /^From: me@bmail\.example\.com/m)
  assert.match(msg, /^To: them@example\.com/m)
  assert.match(msg, /^Subject: Re: Hello/m)
  assert.match(msg, /^Message-ID: <new123@bmail\.example\.com>/m)
  assert.match(msg, /^In-Reply-To: <abc123@example\.com>/m)
  assert.match(msg, /^References: <root@example\.com> <abc123@example\.com>/m)
  assert.match(msg, /^Content-Type: text\/plain; charset=utf-8/m)
  assert.match(msg, /\r\n\r\nThanks!$/)
})

test('buildReplyMimeMessage: omits Message-ID/In-Reply-To/References when not given', () => {
  const msg = buildReplyMimeMessage({
    from: 'me@bmail.example.com',
    to: 'them@example.com',
    subject: 'Re: Hello',
    body: 'Thanks!'
  })
  assert.equal(msg.includes('Message-ID'), false)
  assert.equal(msg.includes('In-Reply-To'), false)
  assert.equal(msg.includes('References'), false)
})

test('buildReplyMimeMessage: References includes the full chain, not just the immediate parent', () => {
  const msg = buildReplyMimeMessage({
    from: 'me@bmail.example.com',
    to: 'them@example.com',
    subject: 'Re: Hello',
    inReplyTo: '<msg3@example.com>',
    references: ['<msg1@example.com>', '<msg2@example.com>', '<msg3@example.com>'],
    body: 'Thanks!'
  })
  const refLine = msg.split('\r\n').find((l) => l.startsWith('References:'))
  assert.equal(refLine, 'References: <msg1@example.com> <msg2@example.com> <msg3@example.com>')
})

test('buildReplyMimeMessage: a malicious subject cannot inject a Bcc header', () => {
  const msg = buildReplyMimeMessage({
    from: 'me@bmail.example.com',
    to: 'them@example.com',
    subject: 'Re: Hi\r\nBcc: attacker@evil.com',
    body: 'Thanks!'
  })
  const bccLines = msg.split('\r\n').filter((line) => line.startsWith('Bcc:'))
  assert.equal(bccLines.length, 0)
})

test('buildReplyMimeMessage: a malicious sender address cannot inject a header', () => {
  const msg = buildReplyMimeMessage({
    from: 'me@bmail.example.com',
    to: 'them@example.com\r\nBcc: attacker@evil.com',
    subject: 'Re: Hi',
    body: 'Thanks!'
  })
  const bccLines = msg.split('\r\n').filter((line) => line.startsWith('Bcc:'))
  assert.equal(bccLines.length, 0)
})
