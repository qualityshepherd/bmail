import { withAuth } from './auth-routes.js'
import { getEmailById, buildReferencesChain, insertSent, updateSentStatus, getSetting } from './db.js'
import { buildReplySubject, generateMessageId, extractDomain, resolveReplyTo } from './reply.js'
import { sendEmail } from './mailer.js'
import { escapeHtml, parseAddressList, looksLikeAddress } from './html.js'
import { parseIdentities, findIdentityByAddress } from './identities.js'
import { isRateLimited, SEND_RATE_LIMIT_MAX_ATTEMPTS, SEND_RATE_LIMIT_WINDOW_MS } from './auth.js'
import { getRateLimit, incrementRateLimit } from './db-auth.js'
import { buildAttachments } from './attachment-upload.js'

export const handleReply = withAuth(async (req, env, ctx, session, emailId) => {
  // Shares the send_attempts bucket with /compose - the thing being bounded
  // is total outbound volume through this identity, not a specific feature.
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown'
  const rlRecord = await getRateLimit(env.DB, 'send_attempts', ip)
  if (isRateLimited(rlRecord, Date.now(), SEND_RATE_LIMIT_MAX_ATTEMPTS)) {
    return new Response('Too many messages sent recently - try again shortly.', { status: 429, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }
  await incrementRateLimit(env.DB, 'send_attempts', ip, Date.now(), SEND_RATE_LIMIT_WINDOW_MS)

  const email = await getEmailById(env.DB, emailId)
  if (!email) return new Response('Not found', { status: 404 })

  const formData = await req.formData()
  const body = (formData.get('body') || '').toString()
  const from = (formData.get('from') || email.recipient || '').toString().trim()
  const files = formData.getAll('attachments').filter((f) => f instanceof File && f.size > 0)

  // To is editable, so the form wins; resolve only as a fallback.
  const rawTo = (formData.get('to') || '').toString().trim()
  const toList = parseAddressList(rawTo || resolveReplyTo(email))
  const ccList = parseAddressList(formData.get('cc'))
  const bccList = parseAddressList(formData.get('bcc'))

  const identities = parseIdentities(await getSetting(env.DB, 'identities'))
  if (!findIdentityByAddress(identities, from)) {
    return new Response('Invalid from address', { status: 400 })
  }

  if (!body.trim()) {
    return new Response(null, { status: 302, headers: { Location: `/message/${emailId}` } })
  }

  if (toList.length === 0) {
    return new Response('To is required', { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }

  const badAddr = [...toList, ...ccList, ...bccList].find((a) => !looksLikeAddress(a))
  if (badAddr) {
    return new Response(`Invalid address: ${badAddr}`, { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }

  let attachments
  try {
    attachments = await buildAttachments(files)
  } catch (err) {
    return new Response(err.message, { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }

  const references = await buildReferencesChain(env.DB, email)
  const messageId = generateMessageId(extractDomain(from))
  const subject = buildReplySubject(email.subject)

  const sentId = await insertSent(env.DB, {
    messageId,
    fromAddress: from,
    toAddress: toList.join(', '),
    ccAddress: ccList.length ? ccList.join(', ') : null,
    bccAddress: bccList.length ? bccList.join(', ') : null,
    subject,
    body,
    inReplyTo: email.message_id,
    createdAt: Date.now()
  })

  try {
    await sendEmail(env, {
      from,
      to: toList,
      cc: ccList.length ? ccList : undefined,
      bcc: bccList.length ? bccList : undefined,
      subject,
      text: body,
      messageId,
      inReplyTo: email.message_id,
      references,
      attachments: attachments.length ? attachments : undefined
    })
    await updateSentStatus(env.DB, sentId, 'sent')
  } catch (err) {
    console.error('Bmail reply send failed:', err)
    await updateSentStatus(env.DB, sentId, 'failed', err.message || 'unknown error').catch(() => {})
    return new Response(
      `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:500px;margin:3rem auto;">
        <p><strong>Failed to send:</strong> ${escapeHtml(err.message || 'unknown error')}</p>
        <p><a href="/sent/${sentId}">&larr; View in Sent</a></p>
      </body></html>`,
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )
  }

  return new Response(null, {
    status: 302,
    headers: { Location: `/message/${emailId}?sent=1` }
  })
})
