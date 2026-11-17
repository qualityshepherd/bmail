// Contact photos get pulled into R2 at import and served from here after.
// Google's vCard hands out lh3.googleusercontent.com urls - render those
// directly and the browser pings Google every time you open your mail, plus
// the links rot. One fetch at import, then never again.

const MAX_AVATAR_BYTES = 512 * 1024

// workers caps subrequests, and a 600-contact vcard can carry 160+ photos
const FETCH_CONCURRENCY = 6

const toHex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')

// Key off the source url so a changed photo lands on a new key and
// refetches itself. Old object is orphaned - it's a few KB, not worth
// chasing.
export async function avatarKey (url) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url))
  return `avatars/${toHex(digest)}`
}

// no svg: it renders as an image but runs script, and we serve these from
// our own origin
export function isStorableImage (contentType) {
  const base = String(contentType || '').split(';')[0].trim().toLowerCase()
  if (base === 'image/svg+xml') return false
  return base.startsWith('image/')
}

// null on anything going wrong - a contact photo isn't worth failing an
// import over
export async function storeAvatar (env, url) {
  if (!/^https?:\/\//i.test(url || '')) return null
  const key = await avatarKey(url)

  const existing = await env.ATTACHMENTS.head(key).catch(() => null)
  if (existing) return key

  let res
  try {
    res = await fetch(url, { redirect: 'follow' })
  } catch {
    return null
  }
  if (!res.ok) return null

  const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
  if (!isStorableImage(contentType)) return null

  // advisory, so check it early then check the real size after reading
  const declared = Number(res.headers.get('content-length') || 0)
  if (declared > MAX_AVATAR_BYTES) return null

  const body = await res.arrayBuffer().catch(() => null)
  if (!body || body.byteLength === 0 || body.byteLength > MAX_AVATAR_BYTES) return null

  await env.ATTACHMENTS.put(key, body, { httpMetadata: { contentType } })
  return key
}

// Deduped first - a couple sharing one photo url is one fetch. Called
// under waitUntil so the import redirect doesn't wait on any of it.
export async function cacheAvatars (env, contacts) {
  const urls = [...new Set((contacts || []).map((c) => c.avatarUrl).filter(Boolean))]
  if (urls.length === 0) return 0

  let next = 0
  let stored = 0
  const worker = async () => {
    while (next < urls.length) {
      const url = urls[next++]
      const key = await storeAvatar(env, url).catch(() => null)
      if (key) stored++
    }
  }
  await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENCY, urls.length) }, worker))
  return stored
}

// Drops avatar objects nothing points at any more. Called after an import
// (a changed photo means a new key and leaves the old one behind) and on
// clear, where the wanted set is empty so the whole prefix goes.
//
// Takes every avatar url currently in the contacts table, not just the ones
// that were imported - an import only replaces the rows it matches, so
// everyone else's photo is still live and must not be swept.
export async function reconcileAvatars (env, avatarUrls) {
  const keys = await Promise.all([...new Set((avatarUrls || []).filter(Boolean))].map(avatarKey))
  const wanted = new Set(keys)

  // List the whole prefix before deleting anything - deleting mid-walk
  // mutates what's being paged over, and R2 caps a delete at 1000 keys.
  const stale = []
  let cursor
  do {
    const listed = await env.ATTACHMENTS.list({ prefix: 'avatars/', cursor })
    for (const o of listed.objects) if (!wanted.has(o.key)) stale.push(o.key)
    cursor = listed.truncated ? listed.cursor : undefined
  } while (cursor)

  for (let i = 0; i < stale.length; i += 1000) {
    await env.ATTACHMENTS.delete(stale.slice(i, i + 1000))
  }
  return stale.length
}
