import { withAuth } from './auth-routes.js'
import { getContactByEmail } from './db-contacts.js'
import { avatarKey, storeAvatar } from './avatars.js'

// GET /avatar/:email - a contact's photo out of our bucket.
//
// The address is only ever a primary-key lookup; the url we fetch comes
// from the row we find. So nothing a caller types can steer an outbound
// request - this can't become an open image proxy. Authed as well, or it'd
// be a way to probe who's in the address book.
export const handleAvatar = withAuth(async (req, env, ctx, session, rawEmail) => {
  let email
  try {
    email = decodeURIComponent(rawEmail || '').toLowerCase()
  } catch {
    return new Response('Not found', { status: 404 })
  }

  const contact = await getContactByEmail(env.DB, email)
  if (!contact || !contact.avatar_url) return new Response('Not found', { status: 404 })

  const key = await avatarKey(contact.avatar_url)
  let object = await env.ATTACHMENTS.get(key)

  // Backfill: anything imported before this existed, or whose fetch failed,
  // heals on first view rather than needing a re-import.
  if (!object) {
    const stored = await storeAvatar(env, contact.avatar_url)
    if (!stored) return new Response('Not found', { status: 404 })
    object = await env.ATTACHMENTS.get(key)
    if (!object) return new Response('Not found', { status: 404 })
  }

  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
      // content-addressed key, so a changed photo misses this cache anyway
      'Cache-Control': 'private, max-age=604800'
    }
  })
})
