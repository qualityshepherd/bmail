import { withAuth } from './auth-routes.js'
import { getSetting, getEmailById } from './db.js'
import { getAllContacts } from './db-contacts.js'
import { parseIdentities, getDefaultIdentity } from './identities.js'
import { escapeHtml, formatDate, renderSettingsMenu } from './html.js'

function renderIdentityOptions (identities) {
  return identities.map((i) =>
    `<option value="${escapeHtml(i.address)}">${escapeHtml(i.name ? `${i.name} <${i.address}>` : i.address)}</option>`
  ).join('')
}

function contactDatalist (contacts) {
  return contacts.map((c) => {
    const value = c.name ? `${escapeHtml(c.name)} <${escapeHtml(c.email)}>` : escapeHtml(c.email)
    return `<option value="${value}"></option>`
  }).join('')
}

export function renderComposePage (identities, contacts = [], defaults = {}, { identity = null, bgImage = '' } = {}) {
  const { to = '', subject = '', body = '', isForward = false } = defaults
  const pageTitle = isForward ? 'Forward' : 'Compose'
  const heading = isForward ? 'Forward message' : 'New message'

  const bodyAttr = bgImage && /^https?:\/\//i.test(bgImage)
    ? ` style="background-image: linear-gradient(rgba(0,0,0,0.55),rgba(0,0,0,0.55)),url('${escapeHtml(bgImage)}')"`
    : ''

  if (identities.length === 0) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Compose - Bmail</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#BF5520">
<meta name="mobile-web-app-capable" content="yes">
<link rel="apple-touch-icon" href="/bmail_logo2.png">
<link rel="stylesheet" href="/base.css">
<link rel="stylesheet" href="/compose.css">
</head>
<body${bodyAttr}>
  <header>
    <h1><a href="/inbox"><img src="/bmail_logo2.png" alt="" class="site-logo">Bmail</a></h1>
    ${renderSettingsMenu(identity)}
  </header>
  <div class="compose-wrap">
    <h2>Compose isn't set up yet</h2>
    <p>Add at least one sending identity first.</p>
    <p><a href="/settings">Set up identities &rarr;</a></p>
  </div>
<script src="/sw-register.js" defer></script>
</body>
</html>`
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${pageTitle} - Bmail</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#BF5520">
<meta name="mobile-web-app-capable" content="yes">
<link rel="apple-touch-icon" href="/bmail_logo2.png">
<link rel="stylesheet" href="/base.css">
<link rel="stylesheet" href="/compose.css">
</head>
<body${bodyAttr}>
  <header>
    <h1><a href="/inbox"><img src="/bmail_logo2.png" alt="" class="site-logo">Bmail</a></h1>
    ${renderSettingsMenu(identity)}
  </header>
  <div class="compose-wrap">
    <h2>${heading}</h2>
    <form method="post" action="/compose" id="compose-form" enctype="multipart/form-data">
      <datalist id="addr-datalist">${contactDatalist(contacts)}</datalist>

      <label class="compose-row" for="from">
        <span class="compose-label">From</span>
        <select id="from" name="from">${renderIdentityOptions(identities)}</select>
      </label>

      <label class="compose-row" for="to" id="to-row">
        <span class="compose-label">To</span>
        <input type="text" id="to" name="to" placeholder="Recipients"
               autocomplete="off" autofocus value="${escapeHtml(to)}">
        <div class="addr-toggles" id="addr-toggles">
          <button type="button" id="show-cc">Cc</button>
          <button type="button" id="show-bcc">Bcc</button>
        </div>
      </label>

      <label class="compose-row compose-hidden" for="cc" id="cc-row">
        <span class="compose-label">Cc</span>
        <input type="text" id="cc" name="cc" placeholder="CC recipients"
               autocomplete="off">
      </label>

      <label class="compose-row compose-hidden" for="bcc" id="bcc-row">
        <span class="compose-label">Bcc</span>
        <input type="text" id="bcc" name="bcc" placeholder="BCC recipients"
               autocomplete="off">
      </label>

      <label class="compose-row" for="subject">
        <span class="compose-label">Subject</span>
        <input type="text" id="subject" name="subject"
               value="${escapeHtml(subject)}">
      </label>

      <textarea id="body" name="body" rows="8"
                placeholder="Write your message...">${escapeHtml(body)}</textarea>

      <div class="drop-zone" id="drop-zone">
        <span class="drop-hint">Drag &amp; drop files, or <button type="button" id="browse-btn">browse</button></span>
        <input type="file" multiple id="file-input" name="attachments" class="compose-hidden" aria-hidden="true">
        <ul class="file-list" id="file-list"></ul>
      </div>

      <div class="compose-actions">
        <button type="submit" id="send-btn">Send</button>
        <span class="compose-send-error" id="compose-send-error" role="alert"></span>
      </div>
    </form>
  </div>
  <script src="/compose.js"></script>
<script src="/sw-register.js" defer></script>
</body>
</html>`
}

export const handleComposePage = withAuth(async (req, env, ctx, session) => {
  const [identitiesRaw, contacts, bgImage] = await Promise.all([
    getSetting(env.DB, 'identities'),
    getAllContacts(env.DB),
    getSetting(env.DB, 'bg_image')
  ])
  const identities = parseIdentities(identitiesRaw)
  const identity = getDefaultIdentity(identities)
  return new Response(renderComposePage(identities, contacts, {}, { identity, bgImage: bgImage || '' }), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  })
})

export const handleForwardPage = withAuth(async (req, env, ctx, session, emailId) => {
  const email = await getEmailById(env.DB, emailId)
  if (!email) return new Response('Not found', { status: 404 })

  const [identitiesRaw, contacts, bgImage] = await Promise.all([
    getSetting(env.DB, 'identities'),
    getAllContacts(env.DB),
    getSetting(env.DB, 'bg_image')
  ])
  const identities = parseIdentities(identitiesRaw)
  const identity = getDefaultIdentity(identities)

  const rawSubject = email.subject || ''
  const fwdSubject = /^fwd:/i.test(rawSubject) ? rawSubject : `Fwd: ${rawSubject}`
  const from = email.sender_display ? `${email.sender_display} <${email.sender}>` : email.sender
  const fwdBody = `\n\n---------- Forwarded message ----------\nFrom: ${from}\nDate: ${formatDate(email.created_at)}\nSubject: ${rawSubject}\n\n${email.body || ''}`

  return new Response(renderComposePage(identities, contacts, { subject: fwdSubject, body: fwdBody, isForward: true }, { identity, bgImage: bgImage || '' }), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  })
})
