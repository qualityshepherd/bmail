import { withAuth } from './auth-routes.js'
import { getEmailById } from './db-email.js'

function parseHttpUrl (header) {
  const matches = header.match(/<(https?:\/\/[^>]+)>/gi) || []
  return matches.map((m) => m.slice(1, -1)).find((u) => /^https?:\/\//i.test(u)) || null
}

export const handleUnsubscribe = withAuth(async (req, env, ctx, session, emailId) => {
  const email = await getEmailById(env.DB, emailId)
  if (!email || !email.list_unsubscribe) return new Response('Not found', { status: 404 })

  const formData = await req.formData()
  const rawBack = (formData.get('back') || '').toString()
  const backParam = rawBack.startsWith('/') && !rawBack.startsWith('//') ? rawBack : `/message/${emailId}`
  const successUrl = `/message/${emailId}?unsubscribed=1&back=${encodeURIComponent(backParam)}`

  const httpUrl = parseHttpUrl(email.list_unsubscribe)
  if (httpUrl) {
    ctx.waitUntil(
      fetch(httpUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click'
      }).catch((err) => console.error('Unsubscribe POST failed:', err))
    )
    return new Response(null, { status: 302, headers: { Location: successUrl } })
  }

  // mailto fallback — return it for the client to open
  const mailtoMatch = email.list_unsubscribe.match(/<(mailto:[^>]+)>/i)
  if (mailtoMatch) {
    return new Response(null, { status: 302, headers: { Location: mailtoMatch[1] } })
  }

  return new Response('No unsubscribe method available', { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
})
