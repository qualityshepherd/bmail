import { withAuth } from './auth-routes.js'
import { setSetting } from './db-admin.js'
import { parseIdentities, formatIdentities } from './identities.js'
import { escapeHtml } from './html.js'

function renderIdentityPreviewList (identities) {
  if (identities.length === 0) return '<p class="empty-hint">No identities yet — add one below.</p>'
  return `<ul class="identity-preview">${identities.map((i, idx) => `
    <li>
      ${i.avatarUrl && /^https?:\/\//i.test(i.avatarUrl)
        ? `<img class="identity-avatar" src="${escapeHtml(i.avatarUrl)}" alt="">`
        : '<span class="identity-avatar identity-avatar-blank"></span>'}
      <span class="identity-address">${escapeHtml(i.address)}</span>
      <span class="identity-name">${escapeHtml(i.name || '(no name)')}</span>
      ${idx === 0 ? '<span class="default-badge">default</span>' : ''}
    </li>`).join('')}</ul>`
}

export function renderIdentitiesTab (rawValue) {
  const identities = parseIdentities(rawValue)
  return `<section class="settings-section">
    <p class="settings-hint">One per line: <code>address,name,avatar url</code>
       (name and avatar are optional). Top line is the default used when composing.</p>
    ${renderIdentityPreviewList(identities)}
    <form method="post" action="/settings/identities">
      <textarea name="identities" rows="5" placeholder="you@example.com,Your Name,https://...
alias@example.com">${escapeHtml(rawValue)}</textarea>
      <button type="submit" class="btn-outline">Save identities</button>
    </form>
  </section>`
}

export const handleSettingsSaveIdentities = withAuth(async (req, env) => {
  const formData = await req.formData()
  const raw = (formData.get('identities') || '').toString()
  const clean = formatIdentities(parseIdentities(raw))
  await setSetting(env.DB, 'identities', clean)
  return new Response(null, { status: 302, headers: { Location: '/settings?tab=identities' } })
})
