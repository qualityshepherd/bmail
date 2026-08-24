import { EmailMessage } from 'cloudflare:email'
import { parseRawEmail } from './mime.js'
import { anyPatternMatches } from './match.js'
import { getBlocklistPatterns, getSpamPatterns, insertEmail, insertAttachment, getEmailByMessageId, deleteEmailsByIds, isDuplicateKeyError } from './db.js'

// Runs the full inbound pipeline for one message. Returns { dropped: true }
// if the sender was blocklisted, { duplicate: true } if this message was
// already processed (Cloudflare can retry delivery on timeout/non-2xx),
// otherwise { dropped: false, emailId }.
// Callers (the email() handler) are responsible for the top-level try/catch
// and fallback-forward behavior described in spec section 2.5.
export async function ingestEmail ({ message, env }) {
  const fullFrom = message.headers.get('from') || message.from

  const blocklistPatterns = await getBlocklistPatterns(env.DB)
  if (anyPatternMatches(blocklistPatterns, message.from, fullFrom)) {
    return { dropped: true }
  }

  const spamPatterns = await getSpamPatterns(env.DB)
  const isSpam = spamPatterns.length > 0 &&
    (anyPatternMatches(spamPatterns, message.from, fullFrom) || anyPatternMatches(spamPatterns, message.to))

  const authResults = message.headers.get('authentication-results') || ''
  const dmarcMatch = authResults.match(/\bdmarc=(\w+)/i)
  const dmarcResult = dmarcMatch ? dmarcMatch[1].toLowerCase() : null

  const parsed = await parseRawEmail(message.raw)
  const messageId = parsed.messageId || message.headers.get('message-id')

  const MAX_BODY_CHARS = 100 * 1024
  let body = parsed.text || ''
  const bodyTruncated = body.length > MAX_BODY_CHARS
  if (bodyTruncated) body = body.slice(0, MAX_BODY_CHARS) + '\n\n[Message truncated — full email forwarded to your fallback address]'

  // Fast path: catches the common retry case (the earlier attempt already
  // fully completed) without touching attachment/SMS logic at all. Messages
  // with no Message-ID at all can't be deduped this way and just proceed
  // normally - there's no reliable identity to check.
  if (messageId) {
    const existing = await getEmailByMessageId(env.DB, messageId)
    if (existing) {
      return { dropped: false, duplicate: true, emailId: existing.id }
    }
  }

  let emailId
  try {
    emailId = await insertEmail(env.DB, {
      sender: message.from,
      recipient: message.to,
      subject: parsed.subject,
      body,
      messageId,
      inReplyTo: message.headers.get('in-reply-to'),
      listUnsubscribe: message.headers.get('list-unsubscribe'),
      dmarcResult,
      createdAt: Date.now(),
      senderDisplay: parsed.senderDisplay,
      cc: parsed.cc,
      status: isSpam ? 'spam' : 'inbox'
    })
  } catch (err) {
    // Race window: two near-simultaneous retries both passed the check
    // above before either had inserted. The unique index catches what the
    // application-level check couldn't - treat this as "already processed",
    // not a real pipeline failure that should trigger fallback-forward.
    if (isDuplicateKeyError(err) && messageId) {
      const existing = await getEmailByMessageId(env.DB, messageId)
      if (existing) return { dropped: false, duplicate: true, emailId: existing.id }
    }
    throw err
  }

  const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024

  const uploadedR2Keys = []
  try {
    for (const attachment of parsed.attachments) {
      if (attachment.content.byteLength > MAX_ATTACHMENT_BYTES) continue
      const r2Key = `attachments/${emailId}/${crypto.randomUUID()}-${attachment.filename}`
      await env.ATTACHMENTS.put(r2Key, attachment.content, {
        httpMetadata: { contentType: attachment.contentType }
      })
      uploadedR2Keys.push(r2Key)
      await insertAttachment(env.DB, {
        emailId,
        filename: attachment.filename,
        contentType: attachment.contentType,
        r2Key,
        size: attachment.content.byteLength
      })
    }
  } catch (err) {
    // Roll back the email row and any R2 objects already written so that
    // Cloudflare's retry sees a clean slate rather than a duplicate message_id.
    await Promise.allSettled([
      deleteEmailsByIds(env.DB, [emailId]),
      ...uploadedR2Keys.map((key) => env.ATTACHMENTS.delete(key))
    ])
    throw err
  }

  if (bodyTruncated && message.canBeForwarded) {
    await message.forward(env.FALLBACK_EMAIL)
  }

  return { dropped: false, emailId }
}

export async function sendSms (env, payload, from) {
  const sender = from || (env.EMAIL_DOMAIN ? `alerts@${env.EMAIL_DOMAIN}` : env.FALLBACK_EMAIL)

  if (env.RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from: sender, to: [env.SMS_GATEWAY_ADDRESS], subject: 'Bmail', text: payload })
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.message || `Resend SMS error ${res.status}`)
    }
    return
  }

  const mimeMessage = [
    `From: ${sender}`,
    `To: ${env.SMS_GATEWAY_ADDRESS}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    payload
  ].join('\r\n')
  const message = new EmailMessage(sender, env.SMS_GATEWAY_ADDRESS, mimeMessage)
  await env.SMS_GATEWAY.send(message)
}
