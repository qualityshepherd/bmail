import { withAuth } from './auth-routes.js'
import { getEmailById, getAttachmentsByEmailId, markRead, getAdjacentEmailId, getSetting, getAllTags } from './db.js'
import { getContactsByEmails, getAllContacts } from './db-contacts.js'
import { escapeHtml, linkify, formatDate, formatBytes, avatarHue, avatarInitials, renderSettingsMenu, parseAddressList, extractEmail, safeRedirect, contactDatalist } from './html.js'
import { buildQuotedReplyText, resolveReplyTo, replyToDiffers } from './reply.js'
import { resolveEffectiveQuery, parseTags, formatTags } from './search.js'
import { parseIdentities, getDefaultIdentity } from './identities.js'
import { renderStarIcon, renderStatusIcons } from './status-icons.js'

const DEFAULT_BACK = '/inbox?q=' + encodeURIComponent('status:inbox')

const TAG_ICON = '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/></svg>'

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

function renderMessagePage (email, attachments, { sent, backParam, prevId, nextId, identities = [], allTags = [], identity = null, bgImage = '', contact = null, allContacts = [] }) {
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

  // Pre-filled, editable - escapeHtml matters since the quoted body is
  // attacker-controlled and a literal </textarea> would break out.
  // Date is a placeholder - this renders on the Worker (UTC), swapped to
  // local time client-side via data-quote-ts.
  const quote = buildQuotedReplyText({
    senderDisplay: email.sender_display,
    sender: email.sender,
    date: '__QUOTE_DATE__',
    body: email.body
  })
  const quotedTextareaContent = escapeHtml(quote)

  // Original CC minus ourselves. The From address stays out of it - if
  // Reply-To was set, From is a bounce box nobody reads.
  const selfBare = extractEmail(email.recipient)
  const replyAllCc = parseAddressList(email.cc)
    .filter((addr) => extractEmail(addr) !== selfBare)
    .join(', ')
  const replyTo = resolveReplyTo(email)

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
<link rel="stylesheet" href="/compose.css">
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
            (email.from_address && email.from_address.toLowerCase() !== email.sender.toLowerCase()) ? `From header: ${email.from_address}` : '',
            email.recipient ? `To: ${email.recipient}` : '',
            email.cc ? `Cc: ${email.cc}` : '',
            email.reply_to ? `Reply-To: ${email.reply_to}` : '',
            email.message_id ? `Message-ID: ${email.message_id}` : '',
            email.dmarc_result ? `DMARC: ${email.dmarc_result}` : ''
          ].filter(Boolean).join('\n'))}">
            <strong>${escapeHtml(displayName)}</strong>${hasDisplayName ? ` <span class="msg-email">&lt;${escapeHtml(email.sender)}&gt;</span>` : ''}
          </span>
          <span class="msg-date" data-ts="${email.created_at}">${escapeHtml(formatDate(email.created_at))}</span>
          ${email.status !== 'inbox' ? `<span class="status-chip status-chip-${escapeHtml(email.status)}">${escapeHtml(email.status)}</span>` : ''}
          ${email.dmarc_result === 'fail' ? '<span class="dmarc-badge" title="Sender authentication failed (DMARC)">⚠ unverified</span>' : ''}
        </div>
          <div class="msg-to">to ${escapeHtml(email.recipient)}</div>
        ${email.cc ? `<div class="msg-cc">cc ${escapeHtml(email.cc)}</div>` : ''}
        ${replyToDiffers(email) ? `<div class="msg-reply-to">replies go to ${escapeHtml(replyTo)}</div>` : ''}
      </div>
    </div>

    ${sentBanner}
    ${unsubscribedBanner}
    ${attachmentsHtml}
    <pre class="body">${body}</pre>
    <div class="reply-open" id="reply-open">
      <button type="button" id="reply-btn" class="btn-outline" data-cc="">Reply</button>
      ${replyAllCc ? `<button type="button" id="reply-all-btn" class="btn-outline" data-cc="${escapeHtml(replyAllCc)}">Reply all</button>` : ''}
      <a href="/message/${email.id}/forward" class="btn-outline">Forward</a>
    </div>
    <form method="post" action="/message/${email.id}/reply" class="reply-form" id="reply-form" enctype="multipart/form-data" hidden>
      <datalist id="addr-datalist">${contactDatalist(allContacts)}</datalist>

      <label class="reply-row" for="reply-from">
        <span class="reply-label">From</span>
        <select id="reply-from" name="from">${renderIdentityOptions(identities, email.recipient)}</select>
      </label>

      <label class="reply-row" for="reply-to">
        <span class="reply-label">To</span>
        <input type="text" id="reply-to" name="to" autocomplete="off" value="${escapeHtml(replyTo)}">
        <div class="addr-toggles" id="reply-addr-toggles">
          <button type="button" id="reply-show-cc">Cc</button>
          <button type="button" id="reply-show-bcc">Bcc</button>
        </div>
      </label>

      <label class="reply-row reply-hidden" for="reply-cc" id="reply-cc-row">
        <span class="reply-label">Cc</span>
        <input type="text" id="reply-cc" name="cc" autocomplete="off">
      </label>

      <label class="reply-row reply-hidden" for="reply-bcc" id="reply-bcc-row">
        <span class="reply-label">Bcc</span>
        <input type="text" id="reply-bcc" name="bcc" autocomplete="off">
      </label>

      <textarea id="body" name="body" rows="12" placeholder="Reply..." data-quote-ts="${email.created_at}">${quotedTextareaContent}</textarea>

      <div class="drop-zone" id="drop-zone">
        <span class="drop-hint">Drop files, paste, or <button type="button" id="browse-btn">browse</button></span>
        <input type="file" multiple id="file-input" name="attachments" class="compose-hidden" aria-hidden="true">
        <ul class="file-list" id="file-list"></ul>
      </div>

      <div class="reply-actions">
        <button type="submit" class="btn-outline">Send reply</button>
        <button type="button" id="reply-cancel" class="btn-text">Cancel</button>
      </div>
    </form>
  </main>
  <script type="module" src="/message.js"></script>
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
  const backParam = safeRedirect(url.searchParams.get('back'), DEFAULT_BACK)

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

  const [attachments, prevId, nextId, identitiesRaw, allTagsRaw, bgImage, contacts, allContacts] = await Promise.all([
    getAttachmentsByEmailId(env.DB, emailId),
    getAdjacentEmailId(env.DB, filters, email.created_at, email.id, 'prev'),
    getAdjacentEmailId(env.DB, filters, email.created_at, email.id, 'next'),
    getSetting(env.DB, 'identities'),
    getAllTags(env.DB),
    getSetting(env.DB, 'bg_image'),
    getContactsByEmails(env.DB, [email.sender]),
    getAllContacts(env.DB)
  ])
  const identities = parseIdentities(identitiesRaw)
  const identity = getDefaultIdentity(identities)
  const allTags = [...new Set(allTagsRaw.flatMap((t) => parseTags(t)))]
  const contact = contacts.get(email.sender.toLowerCase()) || null

  return new Response(renderMessagePage({ ...email, unsubscribed }, attachments, { sent, backParam, prevId, nextId, identities, allTags, identity, bgImage: bgImage || '', contact, allContacts }), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
  })
})
