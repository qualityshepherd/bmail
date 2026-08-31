import { withAuth } from './auth-routes.js'
import { searchEmails, getEmailCount, getAllTags, getUnreadInboxCount, getUnreadSpamCount } from './db-email.js'
import { searchSent, getSentCount } from './db-sent.js'
import { getSetting } from './db-admin.js'
import { getContactsByEmails } from './db-contacts.js'
import { resolveEffectiveQuery, stringifySearchFilters, parseTags, topTags } from './search.js'
import { escapeHtml, formatShortDate, avatarHue, avatarInitials, extractEmail, extractDisplayName, renderSettingsMenu } from './html.js'
import { renderStatusIcons, renderStarIcon } from './status-icons.js'
import { parseIdentities, getDefaultIdentity } from './identities.js'

const FOLDER_LINKS = [
  { label: 'Inbox', query: 'inbox:' },
  { label: 'Archive', query: 'archive:' },
  { label: 'Spam', query: 'spam:' },
  { label: 'Trash', query: 'trash:' },
  { label: 'All', query: 'all:' },
  { label: 'Sent', query: 'sent:' }
]

function renderPreview (raw) {
  if (!raw) return ''
  const text = raw.replace(/\s+/g, ' ').trim()
  return text ? `<span class="preview"> – ${escapeHtml(text)}</span>` : ''
}

function renderTagChips (tagsString) {
  const tags = parseTags(tagsString)
  if (tags.length === 0) return ''
  return tags.map((t) => `<span class="tag-chip">${escapeHtml(t)}</span>`).join('')
}

function renderSentRow (sent, currentUrl, contacts = new Map()) {
  const subjectText = sent.subject ? escapeHtml(sent.subject) : '(no subject)'
  const bareEmail = extractEmail(sent.to_address)
  const contact = contacts.get(bareEmail)
  const displayName = (contact && contact.name) || extractDisplayName(sent.to_address)
  const hue = avatarHue(bareEmail)
  const initials = avatarInitials(displayName, bareEmail)

  const avatarHtml = (contact && contact.avatarUrl && /^https?:\/\//i.test(contact.avatarUrl))
    ? `<img class="avatar avatar-img" src="${escapeHtml(contact.avatarUrl)}" alt="" aria-hidden="true">`
    : `<span class="avatar" style="--hue:${hue}" aria-hidden="true">${initials}</span>`

  const statusBadge = sent.send_status && sent.send_status !== 'sent'
    ? `<span class="sent-status-badge sent-status-${escapeHtml(sent.send_status)}">${escapeHtml(sent.send_status)}</span>`
    : ''

  return `<li class="email-item" data-created-at="${sent.created_at}">
    <a class="email-row" href="/sent/${sent.id}?back=${encodeURIComponent(currentUrl)}" data-ts="${sent.created_at}">
      ${avatarHtml}
      <span class="row-body">
        <span class="row-subject"><span class="subject-text">${subjectText}</span>${statusBadge}${renderPreview(sent.preview)}</span>
        <span class="row-meta"><span class="row-sender" title="${escapeHtml(sent.to_address)}">${escapeHtml(displayName)}</span></span>
      </span>
      <span class="row-date" data-ts="${sent.created_at}">${formatShortDate(sent.created_at)}</span>
    </a>
    <span class="row-icons"></span>
  </li>`
}

function renderRow (email, currentUrl, contacts = new Map()) {
  const subjectText = email.subject ? escapeHtml(email.subject) : '(no subject)'
  const contact = contacts.get(email.sender.toLowerCase())
  const displayName = (contact && contact.name) || email.sender_display || email.sender
  const senderTooltip = email.sender_display ? `${email.sender_display} <${email.sender}>` : email.sender
  const tagChips = renderTagChips(email.tags)
  const statusChip = email.status !== 'inbox'
    ? `<span class="status-chip status-chip-${escapeHtml(email.status)}">${escapeHtml(email.status)}</span>`
    : ''
  const starPrefix = email.starred ? '<span class="subject-star" aria-label="starred">★</span>' : ''
  const dmarcBadge = email.dmarc_result === 'fail'
    ? '<span class="dmarc-badge" title="Sender authentication failed (DMARC)">⚠ unverified</span>'
    : ''
  const unreadClass = email.read ? '' : ' unread'
  const hue = avatarHue(email.sender)
  const initials = avatarInitials(displayName, email.sender)

  const avatarHtml = (contact && contact.avatarUrl && /^https?:\/\//i.test(contact.avatarUrl))
    ? `<img class="avatar avatar-img" src="${escapeHtml(contact.avatarUrl)}" alt="" aria-hidden="true">`
    : `<span class="avatar" style="--hue:${hue}" aria-hidden="true">${initials}</span>`

  return `<li class="email-item${unreadClass}" data-created-at="${email.created_at}">
    <a class="email-row" href="/message/${email.id}?back=${encodeURIComponent(currentUrl)}" data-ts="${email.created_at}">
      ${avatarHtml}
      <span class="row-body">
        <span class="row-subject">${starPrefix}<span class="subject-text">${subjectText}</span>${renderPreview(email.preview)}</span>
        <span class="row-meta"><span class="row-sender" title="${escapeHtml(senderTooltip)}">${escapeHtml(displayName)}</span>${tagChips}${dmarcBadge}</span>
      </span>
      <span class="row-right">
        <span class="row-date" data-ts="${email.created_at}">${formatShortDate(email.created_at)}</span>
        ${statusChip}
      </span>
    </a>
    <span class="row-icons">${renderStarIcon(email.id, email.starred, currentUrl)}${renderStatusIcons(email.id, email.status, currentUrl)}</span>
  </li>`
}

function renderFolderLinks (activeQuery, unreadCount = 0, unreadSpamCount = 0) {
  return FOLDER_LINKS.map((f) => {
    const active = activeQuery === f.query ? ' class="active"' : ''
    const count = f.label === 'Inbox' ? unreadCount : f.label === 'Spam' ? unreadSpamCount : 0
    const badge = count > 0 ? ` <span class="folder-count">${count}</span>` : ''
    return `<a href="/inbox?q=${encodeURIComponent(f.query)}"${active}>${f.label}${badge}</a>`
  }).join('')
}

function renderTagLinks (tags) {
  if (tags.length === 0) return ''
  const links = tags.map((t) => {
    const q = t.tag.includes(' ') ? `tag:"${t.tag}"` : `tag:${t.tag}`
    return `<a href="/inbox?q=${encodeURIComponent(q)}">#${escapeHtml(t.tag)} (${t.count})</a>`
  }).join('')
  return `<nav class="tag-links">${links}</nav>`
}

const DOTS_ICON = '<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/></svg>'

function renderBulkMenu (effectiveQuery, currentUrl, hasEmails) {
  const filters = effectiveQuery.trim()
  const isInbox = filters === 'inbox:'
  const isTrash = filters === 'trash:'
  // Derive status for mark-all-read
  const statusMap = { 'inbox:': 'inbox', 'archive:': 'archive', 'spam:': 'spam', 'trash:': 'trash' }
  const markStatus = statusMap[filters] || ''

  const archiveAllBtn = isInbox
    ? `<form method="post" action="/inbox/archive-all" class="bulk-form">
        <input type="hidden" name="back" value="${escapeHtml(currentUrl)}">
        <button type="submit">Archive all</button>
      </form>`
    : ''

  const emptyTrashBtn = (isTrash && hasEmails)
    ? `<form method="post" action="/trash/empty" class="bulk-form" id="empty-trash-form">
        <input type="hidden" name="back" value="${escapeHtml(currentUrl)}">
        <button type="submit" class="danger-btn">Empty Trash</button>
      </form>`
    : ''

  const isSpam = filters === 'spam:'
  const emptySpamBtn = (isSpam && hasEmails)
    ? `<form method="post" action="/spam/empty" class="bulk-form" id="empty-spam-form">
        <input type="hidden" name="back" value="${escapeHtml(currentUrl)}">
        <button type="submit" class="danger-btn">Empty Spam</button>
      </form>`
    : ''

  return `<details class="bulk-menu">
      <summary class="bulk-trigger" title="Actions">${DOTS_ICON}</summary>
      <div class="bulk-panel">
        <form method="post" action="/inbox/mark-all-read" class="bulk-form">
          <input type="hidden" name="status" value="${escapeHtml(markStatus)}">
          <input type="hidden" name="back" value="${escapeHtml(currentUrl)}">
          <button type="submit">Mark all read</button>
        </form>
        ${archiveAllBtn}
        ${emptySpamBtn}
        ${emptyTrashBtn}
      </div>
    </details>`
}

function renderInboxPage ({ emails, total, effectiveQuery, tags, currentUrl, renderRowFn = renderRow, unreadCount = 0, unreadSpamCount = 0, identity = null, bgImage = '', contacts = new Map() }) {
  const rows = emails.length > 0
    ? emails.map((e) => renderRowFn(e, currentUrl, contacts)).join('\n')
    : '<li class="empty">No mail here.</li>'

  const oldestEmail = emails.length > 0 ? emails[emails.length - 1] : null
  const oldestCreatedAt = oldestEmail ? oldestEmail.created_at : ''
  const oldestId = oldestEmail ? oldestEmail.id : ''
  const newestEmail = emails.length > 0 ? emails[0] : null
  const newestCreatedAt = newestEmail ? newestEmail.created_at : ''
  const newestId = newestEmail ? newestEmail.id : ''

  const bodyAttr = bgImage && /^https?:\/\//i.test(bgImage)
    ? ` style="background-image: linear-gradient(rgba(0,0,0,0.55),rgba(0,0,0,0.55)),url('${escapeHtml(bgImage)}')"`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${unreadCount > 0 ? `(${unreadCount}) ` : ''}Bmail</title>

<link rel="icon" href="/bmail_36px.png" type="image/png" sizes="36x36">
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#BF5520">
<meta name="mobile-web-app-capable" content="yes">
<link rel="apple-touch-icon" href="/bmail_180px.png">
<link rel="stylesheet" href="/base.css">
<link rel="stylesheet" href="/inbox.css">
</head>
<body${bodyAttr}>
  <header>
    <h1><a href="/inbox"><img src="/bmail_logo2.png" alt="" class="site-logo">Bmail</a></h1>
    ${renderSettingsMenu(identity)}
  </header>
  <div class="page-wrap">
    <div class="search-bar">
      <a href="/compose" class="compose-btn">+ Compose</a>
      <form method="get" action="/inbox" class="search-form">
        <input type="text" name="q" value="${escapeHtml(effectiveQuery)}"
               placeholder="inbox: sent: tag: starred: ..." autocomplete="off">
        <button type="submit" class="search-submit" aria-label="Search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </button>
      </form>
    </div>
    <nav class="folder-links">
      ${renderFolderLinks(effectiveQuery, unreadCount, unreadSpamCount)}
      ${renderBulkMenu(effectiveQuery, currentUrl, emails.length > 0)}
    </nav>
    ${renderTagLinks(tags)}
    <ul class="inbox" id="email-list" data-query="${escapeHtml(effectiveQuery)}" data-oldest="${oldestCreatedAt}" data-oldest-id="${oldestId}" data-newest="${newestCreatedAt}" data-newest-id="${newestId}" data-total="${total}">
      ${rows}
    </ul>
  </div>
  <div id="scroll-sentinel"></div>
  <script src="/inbox.js"></script>
<script src="/sw-register.js" defer></script>
</body>
</html>`
}

export const handleInbox = withAuth(async (req, env, ctx, session) => {
  const url = new URL(req.url)
  const rawQuery = url.searchParams.get('q') || ''
  const before = url.searchParams.get('before')
  const beforeId = url.searchParams.get('beforeId')
  const after = url.searchParams.get('after')
  const afterId = url.searchParams.get('afterId')
  const filters = resolveEffectiveQuery(rawQuery)
  const effectiveQuery = stringifySearchFilters(filters)
  const currentUrl = `/inbox?q=${encodeURIComponent(effectiveQuery)}`

  const noStoreHeaders = { 'Cache-Control': 'no-store' }

  // Poll: new emails since cursor — skip all settings/identity fetches
  if (after !== null) {
    const [newEmails, pollUnread] = await Promise.all([
      searchEmails(env.DB, filters, {
        limit: 50,
        after: Number(after),
        afterId: afterId ? Number(afterId) : null
      }),
      getUnreadInboxCount(env.DB)
    ])
    const contacts = newEmails.length > 0 ? await getContactsByEmails(env.DB, newEmails.map((e) => e.sender)) : new Map()
    const rows = newEmails.length > 0 ? newEmails.map((e) => renderRow(e, currentUrl, contacts)).join('\n') : ''
    const newest = newEmails.length > 0 ? newEmails[0] : null
    return new Response(rows, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Newest-Created-At': newest ? String(newest.created_at) : '',
        'X-Newest-Id': newest ? String(newest.id) : '',
        'X-Unread-Count': String(pollUnread),
        ...noStoreHeaders
      }
    })
  }

  // Infinite scroll: older page — skip settings/identity fetches
  if (before !== null && !filters.sent) {
    const emails = await searchEmails(env.DB, filters, {
      limit: 50,
      before: Number(before),
      beforeId: beforeId ? Number(beforeId) : null
    })
    const contacts = emails.length > 0 ? await getContactsByEmails(env.DB, emails.map((e) => e.sender)) : new Map()
    const rows = emails.length > 0 ? emails.map((e) => renderRow(e, currentUrl, contacts)).join('\n') : ''
    const oldest = emails.length > 0 ? emails[emails.length - 1] : null
    return new Response(rows, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Oldest-Created-At': oldest ? String(oldest.created_at) : '',
        'X-Oldest-Id': oldest ? String(oldest.id) : '',
        'X-Has-More': String(emails.length === 50),
        ...noStoreHeaders
      }
    })
  }

  // Full page load — fetch settings/identity once here
  const [identitiesRaw, bgImage] = await Promise.all([
    getSetting(env.DB, 'identities'),
    getSetting(env.DB, 'bg_image')
  ])
  const identity = getDefaultIdentity(parseIdentities(identitiesRaw || ''))

  if (filters.sent) {
    const sent = await searchSent(env.DB, { limit: 50, before: before ? Number(before) : null, text: filters.text })
    const sentContacts = await getContactsByEmails(env.DB, sent.map((s) => extractEmail(s.to_address)))
    if (before !== null) {
      const rows = sent.length > 0 ? sent.map((s) => renderSentRow(s, currentUrl, sentContacts)).join('\n') : ''
      const oldestCreatedAt = sent.length > 0 ? sent[sent.length - 1].created_at : ''
      return new Response(rows, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'X-Oldest-Created-At': String(oldestCreatedAt),
          'X-Has-More': String(sent.length === 50),
          ...noStoreHeaders
        }
      })
    }
    const [total, unreadCount, unreadSpamCount] = await Promise.all([getSentCount(env.DB), getUnreadInboxCount(env.DB), getUnreadSpamCount(env.DB)])
    return new Response(renderInboxPage({ emails: sent, total, effectiveQuery, tags: [], currentUrl, renderRowFn: renderSentRow, unreadCount, unreadSpamCount, identity, bgImage: bgImage || '', contacts: sentContacts }), {
      headers: { 'Content-Type': 'text/html; charset=utf-8', ...noStoreHeaders }
    })
  }

  const emails = await searchEmails(env.DB, filters, { limit: 50 })
  const [total, allTagsRaw, unreadCount, unreadSpamCount, contacts] = await Promise.all([
    getEmailCount(env.DB, filters),
    getAllTags(env.DB),
    getUnreadInboxCount(env.DB),
    getUnreadSpamCount(env.DB),
    getContactsByEmails(env.DB, emails.map((e) => e.sender))
  ])
  const tags = topTags(allTagsRaw, 8)

  return new Response(renderInboxPage({ emails, total, effectiveQuery, tags, currentUrl, unreadCount, unreadSpamCount, identity, bgImage: bgImage || '', contacts }), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...noStoreHeaders }
  })
})
