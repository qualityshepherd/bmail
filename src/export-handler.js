import { withAuth } from './auth-routes.js'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function mboxDate (ts) {
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, ' ')
  return `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${dd} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} ${d.getUTCFullYear()}`
}

export function escapeBody (text) {
  return (text || '').replace(/^From /mg, '>From ')
}

function inboundToMbox (email) {
  const from = email.sender_display ? `${email.sender_display} <${email.sender}>` : email.sender
  const body = escapeBody(email.body)
  let msg = `From ${email.sender} ${mboxDate(email.created_at)}\n`
  msg += `From: ${from}\n`
  msg += `To: ${email.recipient}\n`
  if (email.cc) msg += `Cc: ${email.cc}\n`
  if (email.reply_to) msg += `Reply-To: ${email.reply_to}\n`
  if (email.message_id) msg += `Message-ID: ${email.message_id}\n`
  if (email.in_reply_to) msg += `In-Reply-To: ${email.in_reply_to}\n`
  msg += `Subject: ${email.subject || ''}\n`
  msg += `Date: ${new Date(email.created_at).toUTCString()}\n`
  msg += `Status: ${email.read ? 'RO' : 'O'}\n`
  msg += 'Content-Type: text/plain; charset=utf-8\n'
  msg += `\n${body}\n`
  return msg
}

function sentToMbox (sent) {
  const body = escapeBody(sent.body)
  let msg = `From ${sent.from_address} ${mboxDate(sent.created_at)}\n`
  msg += `From: ${sent.from_address}\n`
  msg += `To: ${sent.to_address}\n`
  if (sent.cc_address) msg += `Cc: ${sent.cc_address}\n`
  if (sent.bcc_address) msg += `Bcc: ${sent.bcc_address}\n`
  if (sent.message_id) msg += `Message-ID: ${sent.message_id}\n`
  if (sent.in_reply_to) msg += `In-Reply-To: ${sent.in_reply_to}\n`
  msg += `Subject: ${sent.subject || ''}\n`
  msg += `Date: ${new Date(sent.created_at).toUTCString()}\n`
  msg += 'Status: RO\n'
  msg += 'Content-Type: text/plain; charset=utf-8\n'
  msg += `\n${body}\n`
  return msg
}

// Workers cap memory at 128MB and everything below loads at once (no
// streaming). Measured in bytes, not message count - 5000 maxed-out 100KB
// messages would be ~500MB, so a count cap alone wouldn't actually bound it.
const MAX_EXPORTABLE_BYTES = 80 * 1024 * 1024

export async function buildMbox (db) {
  const { totalBytes } = await db.prepare(
    `SELECT (SELECT COALESCE(SUM(LENGTH(body)), 0) FROM emails) +
            (SELECT COALESCE(SUM(LENGTH(body)), 0) FROM sent) AS totalBytes`
  ).first()
  if (totalBytes > MAX_EXPORTABLE_BYTES) {
    const mb = (totalBytes / (1024 * 1024)).toFixed(1)
    const limitMb = MAX_EXPORTABLE_BYTES / (1024 * 1024)
    throw new Error(`Mailbox body content is ${mb}MB, too large for a single .mbox export (limit ${limitMb}MB). Use the R2 SQL backup instead.`)
  }

  const [{ results: inbound }, { results: outbound }] = await Promise.all([
    db.prepare(
      'SELECT sender, sender_display, recipient, subject, body, message_id, in_reply_to, cc, reply_to, created_at, read FROM emails ORDER BY created_at ASC'
    ).all(),
    db.prepare(
      'SELECT from_address, to_address, cc_address, bcc_address, subject, body, message_id, in_reply_to, created_at FROM sent ORDER BY created_at ASC'
    ).all()
  ])

  const all = [
    ...inbound.map((e) => ({ ts: e.created_at, text: inboundToMbox(e) })),
    ...outbound.map((s) => ({ ts: s.created_at, text: sentToMbox(s) }))
  ].sort((a, b) => a.ts - b.ts)

  return all.map((m) => m.text).join('\n')
}

export const handleMboxExport = withAuth(async (req, env) => {
  let mbox
  try {
    mbox = await buildMbox(env.DB)
  } catch (err) {
    return new Response(err.message, { status: 413, headers: { 'Content-Type': 'text/plain' } })
  }
  const date = new Date().toISOString().slice(0, 10)

  return new Response(mbox, {
    headers: {
      'Content-Type': 'application/mbox',
      'Content-Disposition': `attachment; filename="bmail-${date}.mbox"`
    }
  })
})
