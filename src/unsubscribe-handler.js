import { withAuth } from './auth-routes.js'
import { getEmailById } from './db-email.js'

export function parseHttpUrl (header) {
  const matches = header.match(/<(https?:\/\/[^>]+)>/gi) || []
  return matches.map((m) => m.slice(1, -1)).find((u) => /^https?:\/\//i.test(u)) || null
}

// RFC 8058 one-click is only safe to automate when the sender explicitly
// confirms support via List-Unsubscribe-Post. Without it, POSTing to the
// URL can return 200 without unsubscribing anything - e.g. a Mailman
// options page just re-renders the form for any POST, one-click or not.
// mailto is preferred over a non-one-click HTTP link since actually sending
// the unsubscribe email is far more likely to be honored by legacy list
// software than POSTing to a page that never confirmed it'd process one.
export function chooseUnsubscribeMethod (email) {
  const header = email.list_unsubscribe || ''
  const httpUrl = parseHttpUrl(header)
  const mailtoMatch = header.match(/<(mailto:[^>]+)>/i)
  const isOneClick = (email.list_unsubscribe_post || '').trim().toLowerCase() === 'list-unsubscribe=one-click'

  if (httpUrl && isOneClick) return { method: 'one-click', target: httpUrl }
  if (mailtoMatch) return { method: 'mailto', target: mailtoMatch[1] }
  if (httpUrl) return { method: 'manual', target: httpUrl }
  return { method: 'none', target: null }
}

export const handleUnsubscribe = withAuth(async (req, env, ctx, session, emailId) => {
  const email = await getEmailById(env.DB, emailId)
  if (!email || !email.list_unsubscribe) return new Response('Not found', { status: 404 })

  const formData = await req.formData()
  const rawBack = (formData.get('back') || '').toString()
  const backParam = rawBack.startsWith('/') && !rawBack.startsWith('//') ? rawBack : `/message/${emailId}`
  const successUrl = `/message/${emailId}?unsubscribed=1&back=${encodeURIComponent(backParam)}`

  const { method, target } = chooseUnsubscribeMethod(email)

  if (method === 'one-click') {
    try {
      const res = await fetch(target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click',
        signal: AbortSignal.timeout(8000)
      })
      if (!res.ok) {
        return new Response(
          `Unsubscribe request failed (sender returned ${res.status}) - you're probably still subscribed. Try blocking ${email.sender} instead.`,
          { status: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
        )
      }
    } catch (err) {
      console.error('Unsubscribe POST failed:', err)
      return new Response(
        `Unsubscribe request failed to reach the sender - you're probably still subscribed. Try blocking ${email.sender} instead.`,
        { status: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
      )
    }
    return new Response(null, { status: 302, headers: { Location: successUrl } })
  }

  // mailto and manual both hand off to the client rather than claiming a
  // success bmail can't actually confirm.
  if (method === 'mailto' || method === 'manual') {
    return new Response(null, { status: 302, headers: { Location: target } })
  }

  return new Response('No unsubscribe method available', { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
})
