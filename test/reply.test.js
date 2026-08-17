import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  sanitizeHeaderValue, buildReplySubject, buildReplyMimeMessage,
  generateMessageId, extractDomain, buildQuotedReplyText
} from '../src/reply.js'

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
