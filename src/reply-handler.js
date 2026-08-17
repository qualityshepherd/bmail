import { withAuth } from './auth-routes.js'
import { getEmailById, buildReferencesChain, insertSent, deleteSentById, getSetting } from './db.js'
import { buildReplySubject, generateMessageId, extractDomain } from './reply.js'
import { sendEmail } from './mailer.js'
import { escapeHtml, parseAddressList, extractEmail } from './html.js'
import { parseIdentities, findIdentityByAddress } from './identities.js'

export const handleReply = withAuth(async (req, env, ctx, session, emailId) => {
  const email = await getEmailById(env.DB, emailId)
  if (!email) return new Response('Not found', { status: 404 })

  const formData = await req.formData()
  const body = (formData.get('body') || '').toString()
  const from = (formData.get('from') || email.recipient || '').toString().trim()
  const replyAll = formData.get('replyAll') === '1'

  const identities = parseIdentities(await getSetting(env.DB, 'identities'))
  if (!findIdentityByAddress(identities, from)) {
    return new Response('Invalid from address', { status: 400 })
  }

  if (!body.trim()) {
    return new Response(null, { status: 302, headers: { Location: `/message/${emailId}` } })
  }

  // Reply-all: CC everyone from the original CC list except ourselves
  let ccList
  if (replyAll && email.cc) {
    const fromBare = extractEmail(from).toLowerCase()
    ccList = parseAddressList(email.cc).filter(
      (addr) => extractEmail(addr).toLowerCase() !== fromBare
    )
  }

  const references = await buildReferencesChain(env.DB, email)
  const messageId = generateMessageId(extractDomain(from))
  const subject = buildReplySubject(email.subject)

  const sentId = await insertSent(env.DB, {
    messageId,
    fromAddress: from,
    toAddress: email.sender,
    ccAddress: ccList && ccList.length ? ccList.join(', ') : null,
    subject,
    body,
    inReplyTo: email.message_id,
    createdAt: Date.now()
  })

  try {
    await sendEmail(env, {
      from,
      to: email.sender,
      cc: ccList && ccList.length ? ccList : undefined,
      subject,
      text: body,
      messageId,
      inReplyTo: email.message_id,
      references
    })
  } catch (err) {
    console.error('Bmail reply send failed:', err)
    await deleteSentById(env.DB, sentId).catch(() => {})
    return new Response(
      `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:500px;margin:3rem auto;">
        <p><strong>Failed to send:</strong> ${escapeHtml(err.message || 'unknown error')}</p>
        <p><a href="/message/${emailId}">&larr; Back to message</a></p>
      </body></html>`,
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )
  }

  return new Response(null, {
    status: 302,
    headers: { Location: `/message/${emailId}?sent=1` }
  })
})
