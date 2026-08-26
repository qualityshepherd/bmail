import { buildReplyMimeMessage, sanitizeHeaderValue } from './reply.js'

// Sends via Resend, CF Email Service, or the legacy CF send_email binding.
// OUTBOUND_PROVIDER in wrangler.toml [vars]:
//   "resend"   — Resend API (free tier, recommended default)
//   "cf-email" — CF Email Service env.EMAIL.send() (Workers paid plan required)
//   unset      — legacy CF send_email binding (single To only, no CC/BCC/attachments)
export async function sendEmail (env, { from, to, cc, bcc, subject, text, messageId, inReplyTo, references, attachments }) {
  if (env.OUTBOUND_PROVIDER === 'resend') {
    return sendViaResend(env, { from, to, cc, bcc, subject, text, messageId, inReplyTo, references, attachments })
  }
  if (env.OUTBOUND_PROVIDER === 'cf-email') {
    return sendViaCFEmail(env, { from, to, cc, bcc, subject, text, messageId, inReplyTo, references, attachments })
  }
  // Legacy CF binding: single To only, no CC/BCC/attachments.
  const firstTo = Array.isArray(to) ? to[0] : to
  return sendViaCF(env, { from, to: firstTo, subject, text, messageId, inReplyTo, references })
}

async function sendViaResend (env, { from, to, cc, bcc, subject, text, messageId, inReplyTo, references, attachments }) {
  const headers = {}
  if (messageId) headers['Message-ID'] = sanitizeHeaderValue(messageId)
  if (inReplyTo) headers['In-Reply-To'] = sanitizeHeaderValue(inReplyTo)
  if (references && references.length) headers.References = references.map(sanitizeHeaderValue).join(' ')

  const toList = (Array.isArray(to) ? to : [to]).map(sanitizeHeaderValue)
  const body = {
    from: sanitizeHeaderValue(from),
    to: toList,
    subject: sanitizeHeaderValue(subject),
    text: text || ' ',
    headers
  }
  if (cc && cc.length) body.cc = (Array.isArray(cc) ? cc : [cc]).map(sanitizeHeaderValue)
  if (bcc && bcc.length) body.bcc = (Array.isArray(bcc) ? bcc : [bcc]).map(sanitizeHeaderValue)
  if (attachments && attachments.length) body.attachments = attachments

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || err.name || `Resend API error ${res.status}`)
  }
}

async function sendViaCFEmail (env, { from, to, cc, bcc, subject, text, messageId, inReplyTo, references, attachments }) {
  if (!env.EMAIL) {
    throw new Error('CF Email binding not configured — add [[send_email]] name="EMAIL" to wrangler.toml (Workers paid plan required)')
  }
  const body = {
    from: sanitizeHeaderValue(from),
    to: (Array.isArray(to) ? to : [to]).map(sanitizeHeaderValue),
    subject: sanitizeHeaderValue(subject),
    text
  }
  if (cc && cc.length) body.cc = (Array.isArray(cc) ? cc : [cc]).map(sanitizeHeaderValue)
  if (bcc && bcc.length) body.bcc = (Array.isArray(bcc) ? bcc : [bcc]).map(sanitizeHeaderValue)
  if (attachments && attachments.length) {
    body.attachments = attachments.map((a) => ({
      filename: a.filename,
      content: a.content,
      type: a.type || 'application/octet-stream',
      disposition: 'attachment'
    }))
  }
  const headers = {}
  if (messageId) headers['Message-ID'] = sanitizeHeaderValue(messageId)
  if (inReplyTo) headers['In-Reply-To'] = sanitizeHeaderValue(inReplyTo)
  if (references && references.length) headers.References = references.map(sanitizeHeaderValue).join(' ')
  if (Object.keys(headers).length) body.headers = headers
  await env.EMAIL.send(body)
}

async function sendViaCF (env, { from, to, subject, text, messageId, inReplyTo, references }) {
  // Dynamic import (not a static top-level one) so this file loads under plain
  // Node for unit tests - 'cloudflare:' is a Workers-runtime-only URL scheme.
  const { EmailMessage } = await import('cloudflare:email')
  const mime = buildReplyMimeMessage({ from, to, subject, messageId, inReplyTo, references, body: text })
  const message = new EmailMessage(sanitizeHeaderValue(from), sanitizeHeaderValue(to), mime)
  await env.OUTBOUND.send(message)
}
