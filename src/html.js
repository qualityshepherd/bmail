// Minimal HTML-escaping for values pulled from stored email data before
// interpolating into a page - sender/subject/body are attacker-controlled
// (anyone can email you anything), so this matters everywhere it's used.
// Kept in one place deliberately: two copies of escaping logic is exactly
// the kind of thing that quietly drifts and reintroduces an XSS hole in
// whichever copy gets forgotten later.
export function escapeHtml (str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function formatDate (timestampMs) {
  return new Date(timestampMs).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  })
}

// Short form for row/list display - no time, just enough to scan a list.
// Omits the year for the current year, includes it otherwise (so old mail
// doesn't silently look recent).
export function formatShortDate (timestampMs) {
  const date = new Date(timestampMs)
  const isThisYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: isThisYear ? undefined : 'numeric'
  })
}

export function formatBytes (bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Deterministic hue (0–359) from any string — used to color initials avatars
// consistently per sender without any external lookup.
export function avatarHue (str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return h % 360
}

export function parseAddressList (raw) {
  if (!raw) return []
  return raw.split(',').map((s) => s.trim()).filter(Boolean)
}

export function looksLikeAddress (addr) {
  const email = extractEmail(addr)
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
}

export function extractEmail (addr) {
  const m = String(addr || '').match(/<([^>]+)>/)
  return m ? m[1].trim().toLowerCase() : String(addr || '').trim().toLowerCase()
}

export function extractDisplayName (addr) {
  const m = String(addr || '').match(/^(.+?)\s*</)
  return m ? m[1].trim() : String(addr || '').trim()
}

export function avatarInitials (display, address) {
  const name = (display || address || '').trim()
  const parts = name.split(/[\s.@_-]+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return (name[0] || '?').toUpperCase()
}

// Converts plain-text URLs and email addresses in email body copy into
// clickable links. Safe to call on attacker-controlled input: non-URL/email
// segments are escaped by escapeHtml; href values are also escaped; the URL
// regex excludes <>"'` so an attacker can't break out of the href attribute.
// Only http/https URLs are linked — javascript:, data:, etc. are never matched.
export function linkify (text) {
  const TOKEN_RE = /(https?:\/\/[^\s<>"'`]+)|([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g
  let result = ''
  let last = 0
  let m

  while ((m = TOKEN_RE.exec(text)) !== null) {
    result += escapeHtml(text.slice(last, m.index))
    last = m.index + m[0].length

    if (m[1]) {
      let url = m[1]
      // Strip trailing punctuation prose wraps around URLs: . , ; : ! ? ' " > ]
      url = url.replace(/[.,;:!?'">\]]+$/, '')
      // Strip trailing ) only when the URL has no ( — preserves Wikipedia-style
      // URLs like /wiki/Foo_(bar) while cleaning up (see https://example.com)
      if (!url.includes('(')) url = url.replace(/\)+$/, '')
      const tail = m[1].slice(url.length)
      result += `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`
      if (tail) result += escapeHtml(tail)
    } else if (m[2]) {
      const addr = m[2]
      result += `<a href="mailto:${escapeHtml(addr)}">${escapeHtml(addr)}</a>`
    }
  }

  result += escapeHtml(text.slice(last))
  return result
}

// Header avatar + settings dropdown — shared by inbox and message-view.
// identity = { address, name, avatarUrl } | null
export function renderSettingsMenu (identity) {
  let avatarHtml
  if (identity && identity.avatarUrl && /^https?:\/\//i.test(identity.avatarUrl)) {
    avatarHtml = `<img src="${escapeHtml(identity.avatarUrl)}" alt="You" class="header-avatar">`
  } else {
    const addr = identity ? identity.address : 'bmail'
    const name = identity ? (identity.name || identity.address) : ''
    const hue = avatarHue(addr)
    const initials = avatarInitials(name, addr)
    avatarHtml = `<span class="header-avatar header-avatar-initials" style="--hue:${hue}">${initials}</span>`
  }

  return `<details class="settings-menu">
    <summary>${avatarHtml}</summary>
    <div class="settings-dropdown">
      <a href="/settings">Settings</a>
      <form method="post" action="/api/logout">
        <button type="submit">Log out</button>
      </form>
    </div>
  </details>`
}
