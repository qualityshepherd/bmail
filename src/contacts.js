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
      current.name = value
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
