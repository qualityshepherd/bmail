import { withAuth } from './auth-routes.js'
import { getSetting, insertSent, deleteSentById } from './db.js'
import { parseIdentities, findIdentityByAddress } from './identities.js'
import { generateMessageId, extractDomain } from './reply.js'
import { sendEmail } from './mailer.js'
import { escapeHtml, parseAddressList, looksLikeAddress } from './html.js'

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024
const MAX_TOTAL_BYTES = 40 * 1024 * 1024

async function fileToBase64 (file) {
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

export const handleCompose = withAuth(async (req, env, ctx, session) => {
  const identities = parseIdentities(await getSetting(env.DB, 'identities'))
  if (identities.length === 0) {
    return new Response('No sending identities configured - add one at /identities', { status: 400 })
  }

  const formData = await req.formData()
  const from = (formData.get('from') || '').toString().trim()
  const toList = parseAddressList(formData.get('to'))
  const ccList = parseAddressList(formData.get('cc'))
  const bccList = parseAddressList(formData.get('bcc'))
  const subject = (formData.get('subject') || '').toString()
  const body = (formData.get('body') || '').toString()
  const files = formData.getAll('attachments').filter((f) => f instanceof File && f.size > 0)

  if (toList.length === 0) {
    return new Response('To is required', { status: 400 })
  }

  const badAddr = [...toList, ...ccList, ...bccList].find((a) => !looksLikeAddress(a))
  if (badAddr) {
    return new Response(`Invalid address: ${badAddr}`, { status: 400 })
  }

  if (!findIdentityByAddress(identities, from)) {
    return new Response('From address is not a configured identity', { status: 400 })
  }

  for (const f of files) {
    if (f.size > MAX_ATTACHMENT_BYTES) {
      return new Response(`Attachment "${f.name}" exceeds 15MB`, { status: 400 })
    }
  }
  const totalSize = files.reduce((s, f) => s + f.size, 0)
  if (totalSize > MAX_TOTAL_BYTES) {
    return new Response('Total attachments exceed 40MB', { status: 400 })
  }

  const attachments = await Promise.all(files.map(async (f) => ({
    filename: f.name,
    content: await fileToBase64(f),
    type: f.type || 'application/octet-stream'
  })))

  const messageId = generateMessageId(extractDomain(from))

  const sentId = await insertSent(env.DB, {
    messageId,
    fromAddress: from,
    toAddress: toList.join(', '),
    ccAddress: ccList.length ? ccList.join(', ') : null,
    bccAddress: bccList.length ? bccList.join(', ') : null,
    subject,
    body,
    inReplyTo: null,
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
      attachments: attachments.length ? attachments : undefined
    })
  } catch (err) {
    console.error('Bmail compose send failed:', err)
    await deleteSentById(env.DB, sentId).catch(() => {})
    return new Response(
      `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:500px;margin:3rem auto;">
        <p><strong>Failed to send:</strong> ${escapeHtml(err.message || 'unknown error')}</p>
        <p>Common cause: this domain isn't onboarded for Email Routing/sending on this
        Cloudflare account yet.</p>
        <p><a href="/compose">&larr; Back to compose</a></p>
      </body></html>`,
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )
  }

  return new Response(null, {
    status: 302,
    headers: { Location: '/inbox' }
  })
})
