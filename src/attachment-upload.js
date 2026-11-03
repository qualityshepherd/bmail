// Shared outbound-attachment handling for compose and reply - size limits
// and base64 encoding for the mailer. Server-side counterpart to
// public/attachments.js (the client-side picker). NOT the same limits as
// pipeline.js's inbound ones - those are a different concern entirely.

export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024
export const MAX_TOTAL_ATTACHMENT_BYTES = 40 * 1024 * 1024

async function fileToBase64 (file) {
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

// Checks size limits and returns the mailer-ready attachment array - throws
// a plain Error with a message that's safe to show the user as-is.
export async function buildAttachments (files) {
  const oversized = files.find((f) => f.size > MAX_ATTACHMENT_BYTES)
  if (oversized) throw new Error(`Attachment "${oversized.name}" exceeds 15MB`)

  const totalSize = files.reduce((s, f) => s + f.size, 0)
  if (totalSize > MAX_TOTAL_ATTACHMENT_BYTES) throw new Error('Total attachments exceed 40MB')

  return Promise.all(files.map(async (f) => ({
    filename: f.name,
    content: await fileToBase64(f),
    type: f.type || 'application/octet-stream'
  })))
}
