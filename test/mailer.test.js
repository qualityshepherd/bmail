import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sendEmail } from '../src/mailer.js'

// sendViaCFEmail previously skipped sanitizeHeaderValue on subject/from/to/cc/bcc
// while the Resend and legacy CF paths both sanitized every field - a crafted
// subject (e.g. from a reply prefilled off an inbound email) could carry raw
// CR/LF through to env.EMAIL.send() unsanitized. Confirms parity now.
test('sendViaCFEmail: strips CRLF from subject/from/to/cc/bcc', async () => {
  let sent
  const env = { OUTBOUND_PROVIDER: 'cf-email', EMAIL: { send: async (body) => { sent = body } } }

  await sendEmail(env, {
    from: 'me@example.com\r\nBcc: attacker@evil.com',
    to: ['you\r\nBcc: attacker@evil.com@example.com'],
    cc: ['cc\r\nX-Injected: 1@example.com'],
    bcc: ['bcc\r\nX-Injected: 1@example.com'],
    subject: 'hello\r\nBcc: attacker@evil.com',
    text: 'body'
  })

  assert.ok(!sent.from.includes('\r') && !sent.from.includes('\n'))
  assert.ok(sent.to.every((v) => !v.includes('\r') && !v.includes('\n')))
  assert.ok(sent.cc.every((v) => !v.includes('\r') && !v.includes('\n')))
  assert.ok(sent.bcc.every((v) => !v.includes('\r') && !v.includes('\n')))
  assert.ok(!sent.subject.includes('\r') && !sent.subject.includes('\n'))
})
