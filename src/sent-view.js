import { withAuth } from './auth-routes.js'
import { getSentById, getSetting } from './db.js'
import { getContactsByEmails } from './db-contacts.js'
import { escapeHtml, linkify, formatDate, avatarHue, avatarInitials, extractEmail, extractDisplayName, renderSettingsMenu } from './html.js'
import { parseIdentities, getDefaultIdentity } from './identities.js'

function renderSentPage (sent, backUrl, { identity = null, bgImage = '', contact = null } = {}) {
  const subject = sent.subject ? escapeHtml(sent.subject) : '(no subject)'
  const toAddresses = sent.to_address.split(',').map((s) => s.trim()).filter(Boolean)
  const firstEmail = extractEmail(toAddresses[0])
  const toDisplay = (contact && contact.name) || extractDisplayName(toAddresses[0])
  const hasDisplayName = toDisplay !== firstEmail
  const hue = avatarHue(firstEmail)
  const initials = toAddresses.length > 1 ? `+${toAddresses.length}` : avatarInitials(toDisplay, firstEmail)

  const avatarHtml = (contact && contact.avatarUrl && /^https?:\/\//i.test(contact.avatarUrl))
    ? `<img class="msg-avatar msg-avatar-img" src="${escapeHtml(contact.avatarUrl)}" alt="" aria-hidden="true">`
    : `<span class="msg-avatar" style="--hue:${hue}" aria-hidden="true">${initials}</span>`

  const bodyAttr = bgImage && /^https?:\/\//i.test(bgImage)
    ? ` style="background-image: linear-gradient(rgba(0,0,0,0.55),rgba(0,0,0,0.55)),url('${escapeHtml(bgImage)}')"`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${subject} - Bmail</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#BF5520">
<meta name="mobile-web-app-capable" content="yes">
<link rel="apple-touch-icon" href="/bmail_logo2.png">
<link rel="stylesheet" href="/base.css">
<link rel="stylesheet" href="/message.css">
</head>
<body${bodyAttr}>
  <header>
    <h1><a href="/inbox"><img src="/bmail_logo2.png" alt="" class="site-logo">Bmail</a></h1>
    <span class="header-center">
      <a href="${escapeHtml(backUrl)}" class="back">&larr; Sent</a>
    </span>
    ${renderSettingsMenu(identity)}
  </header>
  <main class="message">
    <h1>${subject}</h1>
    <div class="msg-header">
      ${avatarHtml}
      <div class="msg-meta">
        <div class="msg-sender-row">
          <span class="msg-from">
            <strong>${escapeHtml(toDisplay)}</strong>${hasDisplayName ? ` <span class="msg-email">&lt;${escapeHtml(firstEmail)}&gt;</span>` : ''}
          </span>
          <span class="msg-date">${escapeHtml(formatDate(sent.created_at))}</span>
        </div>
        <div class="msg-to">to ${escapeHtml(toAddresses.join(', '))}</div>
        <div class="msg-to">from ${escapeHtml(sent.from_address)}</div>
        ${sent.cc_address ? `<div class="msg-to">cc ${escapeHtml(sent.cc_address)}</div>` : ''}
        ${sent.bcc_address ? `<div class="msg-to">bcc ${escapeHtml(sent.bcc_address)}</div>` : ''}
      </div>
    </div>
    ${sent.send_status === 'failed' ? `<p class="send-error-banner">Send failed: ${escapeHtml(sent.send_error || 'unknown error')}</p>` : ''}
    ${sent.send_status === 'pending' ? '<p class="send-error-banner">Send status unknown — the worker may have crashed after inserting this record.</p>' : ''}
    <pre class="body">${linkify(sent.body || '')}</pre>
    <form method="post" action="/sent/${sent.id}/delete" class="delete-form" id="delete-form">
      <input type="hidden" name="back" value="${escapeHtml(backUrl)}">
      <button type="submit">Delete</button>
    </form>
  </main>
  <script src="/sent.js"></script>
<script src="/sw-register.js" defer></script>
</body>
</html>`
}

export const handleSentView = withAuth(async (req, env, ctx, session, sentId) => {
  const sent = await getSentById(env.DB, sentId)
  if (!sent) return new Response('Not found', { status: 404 })

  const url = new URL(req.url)
  const rawBack = url.searchParams.get('back') || ''
  const backUrl = (rawBack.startsWith('/') && !rawBack.startsWith('//')) ? rawBack : '/inbox?q=sent%3A'

  const [identitiesRaw, bgImage, contacts] = await Promise.all([
    getSetting(env.DB, 'identities'),
    getSetting(env.DB, 'bg_image'),
    getContactsByEmails(env.DB, sent.to_address.split(',').map((s) => extractEmail(s.trim())).filter(Boolean))
  ])
  const identity = getDefaultIdentity(parseIdentities(identitiesRaw || ''))
  const contact = contacts.get(extractEmail(sent.to_address.split(',')[0].trim())) || null

  return new Response(renderSentPage(sent, backUrl, { identity, bgImage: bgImage || '', contact }), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
  })
})
