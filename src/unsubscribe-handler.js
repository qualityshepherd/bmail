import { withAuth } from './auth-routes.js'
import { getEmailById } from './db-email.js'
import { sendEmail } from './mailer.js'

export function parseHttpUrl (header) {
  const matches = header.match(/<(https?:\/\/[^>]+)>/gi) || []
  return matches.map((m) => m.slice(1, -1)).find((u) => /^https?:\/\//i.test(u)) || null
}

export function parseMailto (mailtoUrl) {
  const [rawTo, query] = mailtoUrl.replace(/^mailto:/i, '').split('?')
  const params = new URLSearchParams(query || '')
  return { to: decodeURIComponent(rawTo), subject: params.get('subject') || 'unsubscribe' }
}

// RFC 8058 one-click is only safe to treat as a confirmed action when the
// sender explicitly advertises support via List-Unsubscribe-Post. Without
// it, POSTing (or GETing) the URL can return 200/405 without the sender
// having done anything - e.g. a Mailman options page just re-renders the
// form for any POST, one-click or not, and some senders' unsubscribe
// endpoints are POST-only and 405 a plain GET (this is exactly what
// redirecting the browser there used to do). mailto is treated as
// equally confident as one-click since it's the sender's own explicitly
// documented method, not a guess - the browser handing off to a mailto:
// link was the actual bug there, not the choice of method.
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

const postFailure = (sender, status) => new Response(
  `Unsubscribe request failed (sender returned ${status}) - you're probably still subscribed. Try blocking ${sender} instead.`,
  { status: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
)

const networkFailure = (sender) => new Response(
  `Unsubscribe request failed to reach the sender - you're probably still subscribed. Try blocking ${sender} instead.`,
  { status: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
)

export const handleUnsubscribe = withAuth(async (req, env, ctx, session, emailId) => {
  const email = await getEmailById(env.DB, emailId)
  if (!email || !email.list_unsubscribe) return new Response('Not found', { status: 404 })

  const formData = await req.formData()
  const rawBack = (formData.get('back') || '').toString()
  const backParam = rawBack.startsWith('/') && !rawBack.startsWith('//') ? rawBack : `/message/${emailId}`
  const successUrl = (confidence) => `/message/${emailId}?unsubscribed=${confidence}&back=${encodeURIComponent(backParam)}`

  const { method, target } = chooseUnsubscribeMethod(email)

  if (method === 'one-click' || method === 'manual') {
    try {
      const res = await fetch(target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click',
        signal: AbortSignal.timeout(8000)
      })
      if (!res.ok) return postFailure(email.sender, res.status)
    } catch (err) {
      console.error('Unsubscribe POST failed:', err)
      return networkFailure(email.sender)
    }
    // 'manual' means the sender never confirmed one-click support, so a
    // 2xx here is a good sign, not a guarantee - say so.
    return new Response(null, { status: 302, headers: { Location: successUrl(method === 'one-click' ? '1' : '2') } })
  }

  if (method === 'mailto') {
    const { to, subject } = parseMailto(target)
    try {
      await sendEmail(env, { from: email.recipient, to, subject, text: '' })
    } catch (err) {
      console.error('Unsubscribe email send failed:', err)
      // Mailman-style list unsubscribes match the *sending* address against
      // the subscriber list, so this has to be sent as email.recipient
      // specifically - falling back to a different verified identity
      // wouldn't actually unsubscribe anything, just send mail from an
      // address the list doesn't recognize. Surface the real fix instead.
      const notVerified = /domain is not verified/i.test(err.message || '')
      const detail = notVerified
        ? `${email.recipient.split('@')[1]} isn't verified for sending in Resend yet (resend.com/domains) - this has to be sent as ${email.recipient} specifically for the list to recognize it.`
        : `Couldn't send as ${email.recipient}.`
      return new Response(
        `${detail} You're probably still subscribed. Try blocking ${email.sender} instead.`,
        { status: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
      )
    }
    return new Response(null, { status: 302, headers: { Location: successUrl('1') } })
  }

  return new Response('No unsubscribe method available', { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
})
