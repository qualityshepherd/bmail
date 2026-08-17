import { EmailMessage } from 'cloudflare:email'
import { parseRawEmail } from './mime.js'
import { anyPatternMatches } from './match.js'
import { shouldNotify, buildSmsPayload } from './notifications.js'
import { getBlocklistPatterns, getAllowlistPatterns, insertEmail, insertAttachment, getEmailByMessageId, deleteEmailsByIds, isDuplicateKeyError } from './db.js'

// Runs the full inbound pipeline for one message. Returns { dropped: true }
// if the sender was blocklisted, { duplicate: true } if this message was
// already processed (Cloudflare can retry delivery on timeout/non-2xx),
// otherwise { dropped: false, emailId, notified }.
// Callers (the email() handler) are responsible for the top-level try/catch
// and fallback-forward behavior described in spec section 2.5.
export async function ingestEmail ({ message, env, deepLinkBaseUrl }) {
  const blocklistPatterns = await getBlocklistPatterns(env.DB)
  if (anyPatternMatches(blocklistPatterns, message.from)) {
    return { dropped: true }
  }

  const parsed = await parseRawEmail(message.raw)
  const messageId = parsed.messageId || message.headers.get('message-id')

  // Fast path: catches the common retry case (the earlier attempt already
  // fully completed) without touching the allowlist/notify/attachment/SMS
  // logic at all. Messages with no Message-ID at all can't be deduped this
  // way and just proceed normally - there's no reliable identity to check.
  if (messageId) {
    const existing = await getEmailByMessageId(env.DB, messageId)
    if (existing) {
      return { dropped: false, duplicate: true, emailId: existing.id }
    }
  }

  const senderPatterns = await getAllowlistPatterns(env.DB, 'sender')
  const aliasPatterns = await getAllowlistPatterns(env.DB, 'alias')
  const notify = shouldNotify({
    senderPatterns,
    aliasPatterns,
    sender: message.from,
    recipient: message.to
  })

  let emailId
  try {
    emailId = await insertEmail(env.DB, {
      sender: message.from,
      recipient: message.to,
      subject: parsed.subject,
      body: parsed.text,
      messageId,
      inReplyTo: message.headers.get('in-reply-to'),
      notify,
      createdAt: Date.now(),
      senderDisplay: parsed.senderDisplay,
      cc: parsed.cc
    })
  } catch (err) {
    // Race window: two near-simultaneous retries both passed the check
    // above before either had inserted. The unique index (migration 0005)
    // catches what the application-level check couldn't - treat this as
    // "already processed", not a real pipeline failure that should trigger
    // fallback-forward.
    if (isDuplicateKeyError(err) && messageId) {
      const existing = await getEmailByMessageId(env.DB, messageId)
      if (existing) return { dropped: false, duplicate: true, emailId: existing.id }
    }
    throw err
  }

  const uploadedR2Keys = []
  try {
    for (const attachment of parsed.attachments) {
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

  if (notify) {
    const payload = buildSmsPayload({
      sender: message.from,
      subject: parsed.subject,
      deepLinkUrl: `${deepLinkBaseUrl}/message/${emailId}`
    })
    await sendSms(env, payload)
  }

  return { dropped: false, emailId, notified: notify }
}

export async function sendSms (env, payload, from) {
  const sender = from || env.FALLBACK_EMAIL
  const mimeMessage = [
    `From: ${sender}`,
    `To: ${env.SMS_GATEWAY_ADDRESS}`,
    'Subject: Bmail',
    'Content-Type: text/plain; charset=utf-8',
    '',
    payload
  ].join('\r\n')

  const message = new EmailMessage(sender, env.SMS_GATEWAY_ADDRESS, mimeMessage)
  await env.SMS_GATEWAY.send(message)
}
