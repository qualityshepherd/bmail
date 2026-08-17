import { withAuth } from './auth-routes.js'
import { getEmailById, buildReferencesChain, insertSent } from './db.js'
import { buildReplySubject, generateMessageId, extractDomain } from './reply.js'
import { sendEmail } from './mailer.js'
import { escapeHtml, parseAddressList, extractEmail } from './html.js'

export const handleReply = withAuth(async (req, env, ctx, session, emailId) => {
  const email = await getEmailById(env.DB, emailId)
  if (!email) return new Response('Not found', { status: 404 })

  const formData = await req.formData()
  const body = (formData.get('body') || '').toString()
  // Falls back to email.recipient - the correct-by-construction default -
  // if the from field is somehow missing, rather than failing outright.
  const from = (formData.get('from') || email.recipient || '').toString().trim()
  const replyAll = formData.get('replyAll') === '1'

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
    return new Response(
      `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:500px;margin:3rem auto;">
        <p><strong>Failed to send:</strong> ${escapeHtml(err.message || 'unknown error')}</p>
        <p><a href="/message/${emailId}">&larr; Back to message</a></p>
      </body></html>`,
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )
  }

  await insertSent(env.DB, {
    messageId,
    fromAddress: from,
    toAddress: email.sender,
    ccAddress: ccList && ccList.length ? ccList.join(', ') : null,
    subject,
    body,
    inReplyTo: email.message_id,
    createdAt: Date.now()
  })

  return new Response(null, {
    status: 302,
    headers: { Location: `/message/${emailId}?sent=1` }
  })
})
