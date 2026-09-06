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

const isPrivateOrReservedHost = (hostname) => {
  const h = hostname.toLowerCase()
  if (h === 'localhost') return true
  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const [a, b] = ipv4.slice(1).map(Number)
    if (a === 127 || a === 10 || a === 0) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 169 && b === 254) return true // link-local, includes cloud metadata endpoints
    if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  }
  if (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80:')) return true
  return false
}

// The URL comes from an email, so treat it as hostile: http(s) only, never
// a literal private/reserved IP. Doesn't catch DNS rebinding, just the
// obvious literal-IP payloads.
export const isFetchableUnsubscribeUrl = (url) => {
  let parsed
  try { parsed = new URL(url) } catch { return false }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  return !isPrivateOrReservedHost(parsed.hostname)
}

const MAX_UNSUBSCRIBE_REDIRECTS = 3

// Manual redirect following so every hop - not just the original URL - gets
// re-validated. A sender could return a safe-looking URL that redirects
// somewhere hostile.
const fetchUnsubscribeTarget = async (url) => {
  let currentUrl = url
  for (let hop = 0; hop <= MAX_UNSUBSCRIBE_REDIRECTS; hop++) {
    if (!isFetchableUnsubscribeUrl(currentUrl)) throw new Error('unsafe unsubscribe target')
    const res = await fetch(currentUrl, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click',
      signal: AbortSignal.timeout(8000)
    })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) return res
      currentUrl = loc.startsWith('http') ? loc : new URL(loc, currentUrl).href
      continue
    }
    return res
  }
  throw new Error('too many redirects')
}

// One-click is only trustworthy if the sender confirms it via
// List-Unsubscribe-Post - otherwise a POST/GET can 200/405 without doing
// anything (e.g. Mailman just re-renders its options form either way).
// mailto counts as equally confident since it's the sender's own
// documented method, not a guess.
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
      const res = await fetchUnsubscribeTarget(target)
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
