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

// Parses a raw MIME stream into the shape the ingestion pipeline expects.
// message.raw is a ReadableStream; postal-mime accepts a stream, ArrayBuffer,
// or Blob directly.
export async function parseRawEmail (raw) {
  const parsed = await PostalMime.parse(raw)

  const plainText = parsed.text && parsed.text.trim().length > 0
    ? parsed.text
    : stripHtml(parsed.html)

  return {
    subject: parsed.subject || '',
    text: plainText,
    html: parsed.html || null,
    messageId: parsed.messageId || null,
    inReplyTo: parsed.inReplyTo || null,
    senderDisplay: formatSenderDisplay(parsed.from),
    cc: (parsed.cc || []).map((a) => a.name ? `${a.name} <${a.address}>` : a.address).join(', ') || null,
    attachments: (parsed.attachments || []).map((attachment) => ({
      filename: attachment.filename || 'attachment',
      contentType: attachment.mimeType || 'application/octet-stream',
      content: attachment.content // ArrayBuffer by default from postal-mime
    }))
  }
}
