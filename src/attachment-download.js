import { withAuth } from './auth-routes.js'
import { getAttachmentById } from './db.js'

// Strips CR, LF, and double-quotes from attachment filenames before they
// land in a Content-Disposition header. Same class of injection as
// sanitizeHeaderValue in reply.js - a crafted attachment filename with a
// newline becomes a fake header in the response without this.
export function sanitizeFilename (filename) {
  return String(filename || '').replace(/[\r\n"]/g, '')
}

// RFC 5987 percent-encoding for the filename* parameter - encodeURIComponent
// alone leaves ' ( ) * unescaped, which RFC 5987's attr-char grammar forbids.
function encodeRfc5987 (str) {
  return encodeURIComponent(str)
    .replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
}

// Builds an RFC 6266 Content-Disposition value: an ASCII-only fallback for
// older clients, plus a UTF-8 filename* for everyone else. A MIME filename
// full of non-ASCII or unusual Unicode shouldn't have to survive intact
// through the plain quoted-string form, which many parsers handle poorly.
export function contentDispositionValue (disposition, rawFilename) {
  const safe = sanitizeFilename(rawFilename)
  const ascii = safe.replace(/[^\x20-\x7E]/g, '_').trim() || 'attachment'
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeRfc5987(safe)}`
}

// Types safe to render inline (passive media - no script execution risk).
// Everything else is forced to download rather than open in the browser,
// where an unknown file type could otherwise get MIME-sniffed and
// misinterpreted (e.g. an .html attachment executing script in Bmail's
// own origin). X-Content-Type-Options: nosniff (set globally in index.js)
// is the complementary defense - this allowlist decides intent, nosniff
// stops the browser from second-guessing whatever we declare.
export function isInlineSafe (contentType) {
  if (!contentType) return false
  // Normalize before checking — "image/svg+xml; charset=utf-8" must not
  // slip past the SVG exclusion by failing the strict equality check and
  // then matching "image/" below. SVG excluded because it executes script.
  const base = contentType.split(';')[0].trim().toLowerCase()
  if (base === 'image/svg+xml') return false
  return base.startsWith('image/') ||
    base.startsWith('video/') ||
    base === 'application/pdf'
}

export const handleAttachmentDownload = withAuth(async (req, env, ctx, session, emailId, attachmentId) => {
  const attachment = await getAttachmentById(env.DB, attachmentId)

  // Defense in depth: confirm the attachment actually belongs to the email
  // id in the URL, not just that some attachment with this id exists -
  // avoids a crafted URL mismatching ids from resolving to the wrong file.
  if (!attachment || String(attachment.email_id) !== String(emailId)) {
    return new Response('Not found', { status: 404 })
  }

  const object = await env.ATTACHMENTS.get(attachment.r2_key)
  if (!object) return new Response('Not found', { status: 404 })

  const inline = isInlineSafe(attachment.content_type)

  return new Response(object.body, {
    headers: {
      'Content-Type': inline ? attachment.content_type : 'application/octet-stream',
      'Content-Disposition': contentDispositionValue(inline ? 'inline' : 'attachment', attachment.filename),
      'Content-Length': String(attachment.size)
    }
  })
})
