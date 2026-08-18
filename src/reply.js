// Strips CR/LF from any value that will be interpolated into a raw MIME
// header line. Without this, a crafted subject or sender address (both
// attacker-controlled - anyone can email you anything) could inject
// arbitrary extra headers into an outbound reply, e.g. a fake Bcc line.
// Same category of bug as escapeHtml() in html.js, different syntax.
export function sanitizeHeaderValue (value) {
  return String(value || '').replace(/[\r\n]/g, ' ')
}

export function buildReplySubject (originalSubject) {
  const trimmed = (originalSubject || '').trim()
  if (!trimmed) return 'Re:'
  return /^re:/i.test(trimmed) ? trimmed : `Re: ${trimmed}`
}

export function extractDomain (address) {
  const str = String(address || '')
  const bare = str.includes('<') ? (str.match(/<([^>]+)>/) || [])[1] || str : str
  const at = bare.lastIndexOf('@')
  return at !== -1 && bare.slice(at + 1) ? bare.slice(at + 1) : 'localhost'
}

// A fresh Message-ID for OUR outbound reply, so that if the recipient
// replies to it, their client has something to put in In-Reply-To /
// References. NOTE: since Bmail doesn't store sent mail, this id is never
// persisted here - it only helps the *recipient's* side keep threading
// working, not any future thread reconstruction from Bmail's own storage.
export function generateMessageId (domain) {
  return `<${crypto.randomUUID()}@${domain}>`
}

// Classic plain-text quoting ("> " per line), pre-filled into the reply
// textarea as a starting point the user can edit or trim - not injected
// invisibly at send time.
export function buildQuotedReplyText ({ senderDisplay, sender, date, body }) {
  const who = senderDisplay || sender || 'someone'
  const quotedLines = (body || '')
    .trimEnd()
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')
  return `\n\nOn ${date}, ${who} wrote:\n${quotedLines}`
}

// Builds a raw RFC 5322 message for the outbound email binding. Plain text
// only, deliberately - see README: no Markdown-to-HTML conversion, ever.
// inReplyTo is the single immediate-parent message-id; references is the
// full ancestor chain (oldest first, ending with inReplyTo) - see
// db.js's buildReferencesChain for how that chain gets assembled.
export function buildReplyMimeMessage ({ from, to, subject, messageId, inReplyTo, references, body }) {
  const headers = [
    `From: ${sanitizeHeaderValue(from)}`,
    `To: ${sanitizeHeaderValue(to)}`,
    `Subject: ${sanitizeHeaderValue(subject)}`
  ]

  if (messageId) {
    headers.push(`Message-ID: ${sanitizeHeaderValue(messageId)}`)
  }

  if (inReplyTo) {
    headers.push(`In-Reply-To: ${sanitizeHeaderValue(inReplyTo)}`)
  }

  if (references && references.length > 0) {
    headers.push(`References: ${references.map(sanitizeHeaderValue).join(' ')}`)
  }

  headers.push('Content-Type: text/plain; charset=utf-8')

  return headers.join('\r\n') + '\r\n\r\n' + (body || '')
}
