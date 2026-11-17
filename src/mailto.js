// mailto: links, for when bmail is the browser's mail handler. The browser
// hands us the whole link (mailto:a@b.com?subject=hi&body=...) and compose
// opens prefilled. Nothing sends until you hit send, so the worst a hostile
// link can do is fill in a draft.
//
// Parsed by hand rather than with URLSearchParams: that turns + into a
// space, and a+tag@example.com is a real address (RFC 6068 keeps + literal).

const MAX_ADDRS = 2000
const MAX_SUBJECT = 500
const MAX_BODY = 50000

const decode = (s) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

const addrs = (list) => list.map((s) => s.trim()).filter(Boolean).join(', ').slice(0, MAX_ADDRS)

export function parseMailto (raw) {
  const str = String(raw || '').trim()
  if (!/^mailto:/i.test(str)) return {}

  const rest = str.slice('mailto:'.length)
  const q = rest.indexOf('?')
  const path = q === -1 ? rest : rest.slice(0, q)
  const query = q === -1 ? '' : rest.slice(q + 1)

  const to = decode(path).split(',')
  const cc = []
  const bcc = []
  let subject = ''
  let body = ''

  for (const pair of query.split('&')) {
    if (!pair) continue
    const eq = pair.indexOf('=')
    const key = (eq === -1 ? pair : pair.slice(0, eq)).toLowerCase()
    const value = eq === -1 ? '' : decode(pair.slice(eq + 1))
    if (key === 'to') to.push(...value.split(','))
    else if (key === 'cc') cc.push(...value.split(','))
    else if (key === 'bcc') bcc.push(...value.split(','))
    else if (key === 'subject') subject = value
    else if (key === 'body') body = value
    // anything else (in-reply-to and friends) is ignored
  }

  return {
    to: addrs(to),
    cc: addrs(cc),
    bcc: addrs(bcc),
    subject: subject.replace(/[\r\n]+/g, ' ').slice(0, MAX_SUBJECT),
    // links encode line breaks as %0D%0A
    body: body.replace(/\r\n?/g, '\n').slice(0, MAX_BODY)
  }
}
