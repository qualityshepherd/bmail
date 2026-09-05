import { withAuth } from './auth-routes.js'
import { getEmailById, getAttachmentsByEmailId, markRead, getAdjacentEmailId, getSetting, getAllTags } from './db.js'
import { getContactsByEmails } from './db-contacts.js'
import { escapeHtml, linkify, formatDate, formatBytes, avatarHue, avatarInitials, renderSettingsMenu } from './html.js'
import { buildQuotedReplyText } from './reply.js'
import { resolveEffectiveQuery, parseTags, formatTags } from './search.js'
import { parseIdentities, getDefaultIdentity } from './identities.js'
import { renderStarIcon, renderStatusIcons } from './status-icons.js'

const DEFAULT_BACK = '/inbox?q=' + encodeURIComponent('status:inbox')

const TAG_ICON = '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/></svg>'
const FORWARD_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 014-4h12"/></svg>'

export function renderIdentityOptions (identities, selectedAddress) {
  const hasMatch = identities.some((i) => i.address.toLowerCase() === selectedAddress.toLowerCase())
  return identities.map((i) => {
    const label = i.name ? `${i.name} <${i.address}>` : i.address
    const selected = hasMatch && i.address.toLowerCase() === selectedAddress.toLowerCase() ? ' selected' : ''
    return `<option value="${escapeHtml(i.address)}"${selected}>${escapeHtml(label)}</option>`
  }).join('')
}

function renderAttachment (emailId, attachment) {
  const name = escapeHtml(attachment.filename)
  const url = `/message/${emailId}/attachment/${attachment.id}`
  const base = (attachment.content_type || '').split(';')[0].trim().toLowerCase()
  const isImage = base.startsWith('image/') && base !== 'image/svg+xml'
  const isVideo = base.startsWith('video/')
  const isAudio = base.startsWith('audio/')

  const preview = isImage
    ? `<a href="${url}"><img class="attachment-img" src="${url}" alt="${name}" loading="lazy"></a>`
    : isVideo
      ? `<video class="attachment-video" src="${url}" controls></video>`
      : isAudio
        ? `<audio src="${url}" controls></audio>`
        : ''

  return `<li class="attachment">
    ${preview}
    <div class="attachment-meta">
      <a href="${url}"${preview ? '' : ` download="${name}"`}>${name}</a>
      <span class="attachment-size">${formatBytes(attachment.size)}</span>
    </div>
  </li>`
}

function renderMessagePage (email, attachments, { sent, backParam, prevId, nextId, identities = [], allTags = [], identity = null, bgImage = '', contact = null }) {
  const subject = email.subject ? escapeHtml(email.subject) : '(no subject)'
  const displayName = (contact && contact.name) || email.sender_display || email.sender
  const hasDisplayName = displayName !== email.sender
  const body = linkify(email.body || '')
  const hue = avatarHue(email.sender)
  const initials = avatarInitials(displayName, email.sender)

  const avatarHtml = (contact && contact.avatarUrl && /^https?:\/\//i.test(contact.avatarUrl))
    ? `<img class="msg-avatar msg-avatar-img" src="${escapeHtml(contact.avatarUrl)}" alt="" aria-hidden="true">`
    : `<span class="msg-avatar" style="--hue:${hue}" aria-hidden="true">${initials}</span>`

  const attachmentsHtml = attachments.length > 0
    ? `<ul class="attachments">${attachments.map((a) => renderAttachment(email.id, a)).join('\n')}</ul>`
    : ''

  const sentBanner = sent ? '<p class="sent-banner">Reply sent.</p>' : ''
  const unsubscribedBanner = email.unsubscribed === '2'
    ? '<p class="sent-banner">Unsubscribe request sent - this sender hasn\'t confirmed automatic unsubscribe support, so it may not have taken effect.</p>'
    : email.unsubscribed === '1' ? '<p class="sent-banner">Unsubscribed.</p>' : ''
  const tagsValue = escapeHtml(formatTags(parseTags(email.tags)))

  // backParam is already a full, valid path (e.g. "/inbox?q=status%3Ainbox")
  // - round-tripped as-is, never rebuilt from parts here.
  const prevHref = prevId ? `/message/${prevId}?back=${encodeURIComponent(backParam)}` : null
  const nextHref = nextId ? `/message/${nextId}?back=${encodeURIComponent(backParam)}` : null

  const navButtons = `
    <a href="${prevHref || '#'}" class="nav-btn${prevHref ? '' : ' disabled'}" id="prev-btn" aria-label="Previous">&larr;</a>
    <a href="${nextHref || '#'}" class="nav-btn${nextHref ? '' : ' disabled'}" id="next-btn" aria-label="Next">&rarr;</a>`

  // Pre-filled into the textarea, editable/trimmable by the user before
  // sending - not appended invisibly at send time. escapeHtml here matters:
  // the quoted body is attacker-controlled (the original email's own text),
  // and a literal "</textarea>" in it would otherwise break out of the field.
  const quote = buildQuotedReplyText({
    senderDisplay: email.sender_display,
    sender: email.sender,
    date: formatDate(email.created_at),
    body: email.body
  })
  const quotedTextareaContent = escapeHtml(quote)

  const bodyAttr = bgImage && /^https?:\/\//i.test(bgImage)
    ? ` style="background-image: linear-gradient(rgba(0,0,0,0.55),rgba(0,0,0,0.55)),url('${escapeHtml(bgImage)}')"`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${subject} - Bmail</title>

<link rel="icon" href="/bmail_36px.png" type="image/png" sizes="36x36">
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#BF5520">
<meta name="mobile-web-app-capable" content="yes">
<link rel="apple-touch-icon" href="/bmail_180px.png">
<link rel="stylesheet" href="/base.css">
<link rel="stylesheet" href="/message.css">
</head>
<body${bodyAttr} data-prev-href="${prevHref || ''}" data-next-href="${nextHref || ''}">
  <header>
    <h1><a href="/inbox"><img src="/bmail_logo2.png" alt="" class="site-logo">Bmail</a></h1>
    <span class="header-center">
      <span class="nav-buttons">${navButtons}</span>
      <span class="header-actions">
        ${renderStarIcon(email.id, email.starred)}
        ${renderStatusIcons(email.id, email.status, backParam)}
        <a href="/message/${email.id}/forward" class="icon-link" title="Forward" aria-label="Forward">${FORWARD_ICON}</a>
        <details class="tag-details" id="tag-details">
          <summary title="Tags" aria-label="Tags">${TAG_ICON}</summary>
          <div class="tag-panel">
            <datalist id="tags-datalist">
              ${allTags.map((t) => `<option value="${escapeHtml(t)}"></option>`).join('')}
            </datalist>
            <form method="post" action="/message/${email.id}/tags" id="tags-form">
              <input type="hidden" name="back" value="${escapeHtml(backParam)}">
              <input type="text" id="tags" name="tags" value="${tagsValue}"
                     placeholder="taxes, work, 2026" list="tags-datalist" autocomplete="off">
              <button type="submit">Save</button>
            </form>
          </div>
        </details>
        <details class="traffic-menu">
          <summary title="More actions" aria-label="More actions">···</summary>
          <div class="traffic-panel">
            ${email.list_unsubscribe
? `<form method="post" action="/message/${email.id}/unsubscribe">
              <input type="hidden" name="back" value="${escapeHtml(backParam)}">
              <button type="submit">Unsubscribe</button>
            </form>`
: ''}
            <form method="post" action="/message/${email.id}/block">
              <input type="hidden" name="back" value="${escapeHtml(backParam)}">
              <button type="submit">Block sender</button>
            </form>
            <form method="post" action="/message/${email.id}/spam-recipient">
              <input type="hidden" name="back" value="${escapeHtml(backParam)}">
              <button type="submit">Spam recipient</button>
            </form>
          </div>
        </details>
      </span>
    </span>
    ${renderSettingsMenu(identity)}
  </header>
  <main class="message">
    <h1>${email.starred ? '<span class="subject-star" aria-label="starred">★</span>' : ''}${subject}</h1>
    <div class="msg-header">
      ${avatarHtml}
      <div class="msg-meta">
        <div class="msg-sender-row">
          <span class="msg-from" title="${escapeHtml([
            `From: ${email.sender_display ? `${email.sender_display} <${email.sender}>` : email.sender}`,
            email.recipient ? `To: ${email.recipient}` : '',
            email.cc ? `Cc: ${email.cc}` : '',
            email.message_id ? `Message-ID: ${email.message_id}` : '',
            email.dmarc_result ? `DMARC: ${email.dmarc_result}` : ''
          ].filter(Boolean).join('\n'))}">
            <strong>${escapeHtml(displayName)}</strong>${hasDisplayName ? ` <span class="msg-email">&lt;${escapeHtml(email.sender)}&gt;</span>` : ''}
          </span>
          <span class="msg-date">${escapeHtml(formatDate(email.created_at))}</span>
          ${email.status !== 'inbox' ? `<span class="status-chip status-chip-${escapeHtml(email.status)}">${escapeHtml(email.status)}</span>` : ''}
          ${email.dmarc_result === 'fail' ? '<span class="dmarc-badge" title="Sender authentication failed (DMARC)">⚠ unverified</span>' : ''}
        </div>
          <div class="msg-to">to ${escapeHtml(email.recipient)}</div>
        ${email.cc ? `<div class="msg-cc">cc ${escapeHtml(email.cc)}</div>` : ''}
      </div>
    </div>

    ${sentBanner}
    ${unsubscribedBanner}
    ${attachmentsHtml}
    <pre class="body">${body}</pre>
    <form method="post" action="/message/${email.id}/reply" class="reply-form">
      <select name="from">${renderIdentityOptions(identities, email.recipient)}</select>
      <textarea id="body" name="body" rows="12" placeholder="Reply...">${quotedTextareaContent}</textarea>
      <div class="reply-actions">
        <button type="submit" name="replyAll" value="0">Send reply</button>
        ${email.cc ? '<button type="submit" name="replyAll" value="1">Reply all</button>' : ''}
      </div>
    </form>
  </main>
  <script src="/message.js"></script>
<script src="/sw-register.js" defer></script>
</body>
</html>`
}

export const handleMessageView = withAuth(async (req, env, ctx, session, emailId) => {
  const email = await getEmailById(env.DB, emailId)
  if (!email) return new Response('Not found', { status: 404 })

  if (!email.read) await markRead(env.DB, emailId)

  const url = new URL(req.url)
  const sent = url.searchParams.get('sent') === '1'
  const unsubscribed = url.searchParams.get('unsubscribed') || ''
  const rawBack = url.searchParams.get('back') || ''
  const backParam = (rawBack.startsWith('/') && !rawBack.startsWith('//')) ? rawBack : DEFAULT_BACK

  // backParam is a full path like "/inbox?q=status%3Aarchive" - extract
  // just the query text to resolve filters, but keep backParam itself
  // intact for rendering (it's already a valid, complete link).
  let backQuery = 'status:inbox'
  try {
    backQuery = new URL(backParam, url.origin).searchParams.get('q') || 'status:inbox'
  } catch {
    // malformed back param - fall back to the inbox default rather than throw
  }
  const filters = resolveEffectiveQuery(backQuery)

  const [attachments, prevId, nextId, identitiesRaw, allTagsRaw, bgImage, contacts] = await Promise.all([
    getAttachmentsByEmailId(env.DB, emailId),
    getAdjacentEmailId(env.DB, filters, email.created_at, email.id, 'prev'),
    getAdjacentEmailId(env.DB, filters, email.created_at, email.id, 'next'),
    getSetting(env.DB, 'identities'),
    getAllTags(env.DB),
    getSetting(env.DB, 'bg_image'),
    getContactsByEmails(env.DB, [email.sender])
  ])
  const identities = parseIdentities(identitiesRaw)
  const identity = getDefaultIdentity(identities)
  const allTags = [...new Set(allTagsRaw.flatMap((t) => parseTags(t)))]
  const contact = contacts.get(email.sender.toLowerCase()) || null

  return new Response(renderMessagePage({ ...email, unsubscribed }, attachments, { sent, backParam, prevId, nextId, identities, allTags, identity, bgImage: bgImage || '', contact }), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
  })
})
