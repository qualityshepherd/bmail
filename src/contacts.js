// Parses one or more vCards from raw text.
// Handles line unfolding (RFC 6350 §3.2), multiple vCARDs per file,
// and both vCard 3.0 and 4.0. Base64 PHOTO entries are silently skipped
// — only URI/URL photo values are kept.
export function parseVCards (text) {
  const results = []
  // Unfold: CRLF or LF followed by a single space/tab continues the previous line
  const unfolded = (text || '').replace(/\r?\n[ \t]/g, '')
  const lines = unfolded.split(/\r?\n/)

  let current = null
  for (const line of lines) {
    const upper = line.toUpperCase()
    if (upper === 'BEGIN:VCARD') {
      current = { email: '', name: '', avatarUrl: '' }
      continue
    }
    if (upper === 'END:VCARD') {
      // our own export writes the address as FN when there's no name
      if (current && current.name.toLowerCase() === current.email) current.name = ''
      if (current && current.email) results.push(current)
      current = null
      continue
    }
    if (!current) continue

    // Property name is everything before the first ':' or ';'
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const rawProp = line.slice(0, colonIdx).toUpperCase()
    // Strip vCard group prefix — Apple Contacts exports "item1.EMAIL", etc.
    const dotIdx = rawProp.indexOf('.')
    const propFull = dotIdx !== -1 ? rawProp.slice(dotIdx + 1) : rawProp
    const value = line.slice(colonIdx + 1).trim()

    // FN (formatted/full name) — take the first one seen
    if (propFull === 'FN' && !current.name) {
      current.name = value.replace(/\\([\\,;nN])/g, (_, c) => c === 'n' || c === 'N' ? ' ' : c)
      continue
    }

    // EMAIL — take the first address seen; prefer TYPE=PREF or PREF=1
    if (propFull === 'EMAIL' || propFull.startsWith('EMAIL;')) {
      if (!current.email) {
        current.email = value.toLowerCase()
      } else if (/PREF/i.test(propFull)) {
        current.email = value.toLowerCase()
      }
      continue
    }

    // PHOTO — only keep URI/URL values, skip base64
    if ((propFull === 'PHOTO' || propFull.startsWith('PHOTO;')) && !current.avatarUrl) {
      const isBase64 = /ENCODING\s*=\s*(b|base64)/i.test(propFull)
      if (!isBase64 && /^https?:\/\//i.test(value)) {
        current.avatarUrl = value
      }
      continue
    }
  }

  return results
}

// vCard 3.0 text escaping: backslash first, then the separators
const vEsc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1')

// The photo goes out as its original url, not the bytes - small file, and
// Apple and Google both follow a PHOTO uri. A dead link is just no photo.
export function toVCards (contacts) {
  return contacts.map((c) => [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${vEsc(c.name || c.email)}`,
    `N:${vEsc(c.name)};;;;`,
    `EMAIL;TYPE=INTERNET:${c.email}`,
    ...(/^https?:\/\//i.test(c.avatar_url || '') ? [`PHOTO;VALUE=URI:${c.avatar_url}`] : []),
    'END:VCARD'
  ].join('\r\n')).join('\r\n') + (contacts.length ? '\r\n' : '')
}

// "K Trout <k@trout.fish>" -> typed name; a bare address has no opinion.
const typedName = (addr) => {
  const m = String(addr || '').match(/^\s*"?(.*?)"?\s*<[^>]+>\s*$/)
  return m ? m[1].trim() : ''
}

// Who a send teaches us about: To and Cc, never Bcc, never our own
// addresses. A reply with no typed name borrows the From name of the
// mail being answered - as a fill, not an overwrite.
export function peopleFromSend ({ to = [], cc = [], own = [], repliedTo = null }) {
  const mine = new Set(own.map((a) => String(a).trim().toLowerCase()))
  const theirs = new Set([repliedTo?.from_address, repliedTo?.sender].filter(Boolean).map((a) => a.trim().toLowerCase()))
  const seen = new Map()
  for (const addr of [...to, ...cc]) {
    const m = String(addr).match(/<([^>]+)>/)
    const email = (m ? m[1] : String(addr)).trim().toLowerCase()
    if (!email.includes('@') || mine.has(email) || seen.has(email)) continue
    const name = typedName(addr)
    if (name) seen.set(email, { email, name, typed: true })
    else if (theirs.has(email) && repliedTo.sender_display) seen.set(email, { email, name: repliedTo.sender_display, typed: false })
    else seen.set(email, { email, name: '', typed: false })
  }
  return [...seen.values()]
}
