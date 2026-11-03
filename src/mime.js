import PostalMime from 'postal-mime'

// Strips HTML tags for the rare case a message has HTML but no text/plain
// part and postal-mime's email.text comes back empty. Deliberately dumb:
// this is a fallback, not a renderer, so we don't try to preserve structure.
export function stripHtml (html) {
  return (html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<\/(p|div|br|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Pulls <a href> targets out of the HTML that never made it into the plain
// text - catches ESPs whose auto-generated text/plain alternative drops a
// button-only CTA (the confirm/reset link only exists in the HTML part).
// Returns "label: href" (or bare href for an image-only link) - marketing
// mail routes every link through the same click-tracking domain, so the
// bare URLs are otherwise indistinguishable from each other.
export function extractMissingLinks (html, text) {
  if (!html) return []
  const seen = new Set()
  const missing = []
  const re = /<a\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let m
  while ((m = re.exec(html)) !== null) {
    const href = m[1].trim()
    if (!href || href.startsWith('#') || /^javascript:/i.test(href)) continue
    if (seen.has(href) || text.includes(href)) continue
    seen.add(href)
    const label = m[2]
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    missing.push(label ? `${label}: ${href}` : href)
  }
  return missing
}

// Formats a parsed From header for display: "Name <address>" if a display
// name was given, otherwise just the bare address. Pure and separate from
// anything security-relevant - this is ONLY for what a human reads in the
// dashboard. Blocklist/allowlist/notification matching must keep using the
// envelope sender (message.from from Cloudflare), never this - the header
// From is attacker-controlled and easily spoofed, unlike the envelope.
// Formats a parsed From header for display: just the display NAME, or
// null if the sender didn't include one. Deliberately does NOT include
// the address - that's already stored separately (the envelope `sender`
// column), so combining them here would be duplicating data. Callers
// combine name + envelope address themselves (e.g. for a hover tooltip).
// This is ONLY for what a human reads - blocklist/allowlist/notification
// matching must keep using the envelope sender, never this - the header
// From is attacker-controlled and easily spoofed, unlike the envelope.
export function formatSenderDisplay (from) {
  if (!from || !from.name) return null
  return from.name
}

// postal-mime Address[] → the comma-separated TEXT that D1 stores.
export function formatAddressList (addresses) {
  return (addresses || [])
    .map((a) => a.name ? `${a.name} <${a.address}>` : a.address)
    .filter(Boolean)
    .join(', ') || null
}

// postal-mime drops Reply-To entirely if its address-grammar parser can't
// make sense of the value (no error, just absent from parsed.replyTo) - seen
// with some real-world relay addresses. Grab the raw header text as a
// fallback so a parser miss doesn't mean we silently lose the address.
function rawHeader (headers, key) {
  const match = (headers || []).find((h) => h.key === key)
  return match ? match.value.trim() || null : null
}

// Parses a raw MIME stream into the shape the ingestion pipeline expects.
// message.raw is a ReadableStream; postal-mime accepts a stream, ArrayBuffer,
// or Blob directly.
export async function parseRawEmail (raw) {
  const parsed = await PostalMime.parse(raw)

  const plainText = parsed.text && parsed.text.trim().length > 0
    ? parsed.text
    : stripHtml(parsed.html)

  const missingLinks = extractMissingLinks(parsed.html, plainText)
  const finalText = missingLinks.length > 0
    ? `${plainText}\n\nLinks:\n${missingLinks.join('\n')}`
    : plainText

  return {
    subject: parsed.subject || '',
    text: finalText,
    html: parsed.html || null,
    messageId: parsed.messageId || null,
    inReplyTo: parsed.inReplyTo || null,
    senderDisplay: formatSenderDisplay(parsed.from),
    // The header From address, not the envelope. `sender` elsewhere in the
    // app IS the envelope (message.from) - right for spoofing-resistant
    // blocklist checks, wrong for replies. Bounce-safe senders (craigslist
    // included) use a different envelope than header From on purpose.
    fromAddress: (parsed.from && parsed.from.address) ? parsed.from.address.trim() : null,
    cc: formatAddressList(parsed.cc),
    // Craigslist & co. put a bounce address in From, the real one here.
    replyTo: formatAddressList(parsed.replyTo) || rawHeader(parsed.headers, 'reply-to'),
    attachments: (parsed.attachments || []).map((attachment) => ({
      filename: attachment.filename || 'attachment',
      contentType: attachment.mimeType || 'application/octet-stream',
      content: attachment.content // ArrayBuffer by default from postal-mime
    }))
  }
}
