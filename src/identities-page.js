import { withAuth } from './auth-routes.js'
import { getSetting, setSetting } from './db.js'
import { parseIdentities, formatIdentities } from './identities.js'
import { escapeHtml } from './html.js'

function renderPreview (identities) {
  if (identities.length === 0) return '<p class="empty">No identities yet - add one below.</p>'
  return `<ul class="identity-preview">${identities.map((i, idx) => `
    <li>
      ${i.avatarUrl && /^https?:\/\//i.test(i.avatarUrl) ? `<img class="avatar" src="${escapeHtml(i.avatarUrl)}" alt="">` : '<span class="avatar avatar-blank"></span>'}
      <span class="identity-address">${escapeHtml(i.address)}</span>
      <span class="identity-name">${escapeHtml(i.name || '(no name)')}</span>
      ${idx === 0 ? '<span class="default-badge">default</span>' : ''}
    </li>`).join('')}</ul>`
}

function renderIdentitiesPage (rawValue) {
  const identities = parseIdentities(rawValue)

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Identities - Bmail</title>
<link rel="stylesheet" href="/base.css">
<link rel="stylesheet" href="/identities.css">
</head>
<body>
  <header>
    <a href="/inbox" class="back">&larr; Inbox</a>
  </header>
  <main class="identities">
    <h1>Sending identities</h1>
    <p class="hint">One per line: <code>address,name,avatar url</code> (name and avatar
       are optional). Top line is the default used when composing new mail.</p>

    ${renderPreview(identities)}

    <form method="post" action="/identities">
      <textarea name="identities" rows="10" placeholder="brine@casadeocio.org,Brine,https://...
intern@casadeocio.org,The Intern,https://...">${escapeHtml(rawValue)}</textarea>
      <button type="submit">Save</button>
    </form>
  </main>
</body>
</html>`
}

export const handleIdentitiesPage = withAuth(async (req, env, ctx, session) => {
  const rawValue = (await getSetting(env.DB, 'identities')) || ''
  return new Response(renderIdentitiesPage(rawValue), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  })
})

export const handleIdentitiesUpdate = withAuth(async (req, env, ctx, session) => {
  const formData = await req.formData()
  const raw = (formData.get('identities') || '').toString()
  // Round-trip through parse/format to normalize formatting (consistent
  // spacing, drop blank lines) same as tags does.
  const clean = formatIdentities(parseIdentities(raw))
  await setSetting(env.DB, 'identities', clean)

  return new Response(null, {
    status: 302,
    headers: { Location: '/identities' }
  })
})
