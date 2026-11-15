// Pure gating logic for inbound mail, kept separate from pipeline.js (which
// touches D1/R2) so it's trivially unit-testable.
//
// MAX_RAW_BYTES matches Cloudflare Email Routing's own inbound cap - nothing
// larger than that ever reaches the Worker in the first place, so this is a
// fail-fast with a clear error rather than a load-bearing defense. Attachment
// totals are capped below that, not at some larger number, because they're
// decoded bytes carved out of the same capped raw message.
export const MAX_RAW_BYTES = 25 * 1024 * 1024
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
export const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024
// Each attachment costs an R2 put + a D1 insert - a message built out of
// hundreds of tiny parts is a cheap way to burn through both regardless of
// total bytes, so this is a separate cap from the byte limits above.
export const MAX_ATTACHMENT_COUNT = 50

export function isOversizedRawMessage (rawSize) {
  return rawSize > MAX_RAW_BYTES
}

export function attachmentAllowed ({ byteLength, totalBytesSoFar, countSoFar }) {
  if (countSoFar >= MAX_ATTACHMENT_COUNT) return false
  if (byteLength > MAX_ATTACHMENT_BYTES) return false
  if (totalBytesSoFar + byteLength > MAX_TOTAL_ATTACHMENT_BYTES) return false
  return true
}
