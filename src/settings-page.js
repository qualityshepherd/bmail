import { withAuth } from './auth-routes.js'
import { getSetting, setSetting, getSpamlistText, setSpamlist, getBlocklistText, setBlocklist } from './db-admin.js'
import { autoWildcard } from './filters.js'
import { getAllContactsCount, upsertContacts, deleteAllContacts } from './db-contacts.js'
import { parseIdentities, formatIdentities } from './identities.js'
import { parseVCards } from './contacts.js'
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

function renderIdentitiesTab (rawValue) {
  const identities = parseIdentities(rawValue)
  return `<section class="settings-section">
    <p class="settings-hint">One per line: <code>address,name,avatar url</code>
       (name and avatar are optional). Top line is the default used when composing.</p>
    ${renderIdentityPreviewList(identities)}
    <form method="post" action="/settings/identities">
      <textarea name="identities" rows="5" placeholder="you@example.com,Your Name,https://...
alias@example.com">${escapeHtml(rawValue)}</textarea>
      <button type="submit">Save identities</button>
    </form>
  </section>`
}

function renderAppearanceTab (bgImage) {
  return `<section class="settings-section">
    <p class="settings-hint">Background image URL (leave blank for none).</p>
    <form method="post" action="/settings/appearance">
      <input type="url" name="bg_image" value="${escapeHtml(bgImage)}"
             placeholder="https://example.com/wallpaper.jpg" autocomplete="off">
      <button type="submit">Save appearance</button>
    </form>
  </section>`
}

function renderContactsTab (contactCount) {
  const countLine = contactCount === 0
    ? '<p class="empty-hint">No contacts imported yet.</p>'
    : `<p class="settings-hint">${contactCount} contact${contactCount === 1 ? '' : 's'} stored.</p>`

  return `<section class="settings-section">
    <p class="settings-hint">Paste the contents of a <code>.vcf</code> file to import contacts.
       Names and avatar URLs are used in the inbox. New contacts are added; existing overwritten. Base64 photos are skipped.</p>
    ${countLine}
    <form method="post" action="/settings/contacts">
      <textarea name="vcf" rows="5" placeholder="BEGIN:VCARD&#10;VERSION:3.0&#10;FN:Jane Smith&#10;EMAIL:jane@example.com&#10;PHOTO;VALUE=URI:https://example.com/jane.jpg&#10;END:VCARD"></textarea>
      <button type="submit">Import contacts</button>
    </form>
    ${contactCount > 0
      ? `<details class="clear-contacts">
           <summary>Clear all contacts</summary>
           <form method="post" action="/settings/contacts/clear">
             <p>Delete all ${contactCount} contact${contactCount === 1 ? '' : 's'}? This cannot be undone.</p>
             <button type="submit">Yes, delete all</button>
           </form>
         </details>`
      : ''}
  </section>`
}

function renderFiltersTab (spamText, blockText) {
  return `<section class="settings-section">
    <p class="settings-hint">One pattern per line. Accepted formats: <code>user@domain.com</code> or <code>*@domain.com</code>.</p>
    <form method="post" action="/settings/filters">
      <label for="spamlist">Spam list — always deliver to Spam</label>
      <textarea id="spamlist" name="spamlist" rows="5" placeholder="shadyrv@example.com&#10;*@marketing.example.com">${escapeHtml(spamText)}</textarea>
      <label for="blocklist">Block list — silently drop, never stored</label>
      <textarea id="blocklist" name="blocklist" rows="5" placeholder="troll@example.com&#10;*@spam.example.com">${escapeHtml(blockText)}</textarea>
      <button type="submit">Save filters</button>
    </form>
  </section>`
}

function renderExportTab () {
  return `<section class="settings-section">
    <p class="settings-hint">Download all received and sent mail as a single .mbox file.
       Importable into Thunderbird, Apple Mail, and most email clients.</p>
    <a href="/export/mbox" class="btn-outline">Download .mbox</a>
    <h3>Database backup</h3>
    <p class="settings-hint">Saves a SQL dump to R2 (<code>backups/bmail-YYYY-MM-DD.sql</code>).
       Runs automatically at 00:42 MDT. Run manually before migrations or anything risky.</p>
    <form method="post" action="/backup/run">
      <button type="submit">Back up now</button>
    </form>
  </section>`
}

function renderSettingsPage (tab, identitiesRaw, bgImage, contactCount = 0, spamText = '', blockText = '') {
  const tabs = [
    { key: 'identities', label: 'Identities' },
    { key: 'appearance', label: 'Appearance' },
    { key: 'contacts', label: 'Contacts' },
    { key: 'filters', label: 'Filters' },
    { key: 'export', label: 'Export' }
  ]

  const tabNav = tabs.map((t) => {
    const active = tab === t.key ? ' class="active"' : ''
    return `<a href="/settings?tab=${t.key}"${active}>${t.label}</a>`
  }).join('')

  const content = tab === 'appearance'
    ? renderAppearanceTab(bgImage)
    : tab === 'contacts'
      ? renderContactsTab(contactCount)
      : tab === 'filters'
        ? renderFiltersTab(spamText, blockText)
        : tab === 'export'
          ? renderExportTab()
          : renderIdentitiesTab(identitiesRaw)

  const bodyAttr = bgImage && /^https?:\/\//i.test(bgImage)
    ? ` style="background-image: linear-gradient(rgba(0,0,0,0.55),rgba(0,0,0,0.55)),url('${escapeHtml(bgImage)}')"`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Settings – Bmail</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#BF5520">
<meta name="mobile-web-app-capable" content="yes">
<link rel="apple-touch-icon" href="/bmail_logo2.png">
<link rel="stylesheet" href="/base.css">
<link rel="stylesheet" href="/settings.css">
<script src="/settings.js" defer></script>
</head>
<body${bodyAttr}>
  <header>
    <h1><a href="/inbox"><img src="/bmail_logo2.png" alt="" class="site-logo">Bmail</a></h1>
  </header>
  <div class="settings-wrap">
    <nav class="settings-tabs">${tabNav}</nav>
    ${content}
  </div>
<script src="/sw-register.js" defer></script>
</body>
</html>`
}

export const handleSettingsPage = withAuth(async (req, env) => {
  const url = new URL(req.url)
  const tab = url.searchParams.get('tab') || 'identities'
  const [identitiesRaw, bgImage, contactCount, spamText, blockText] = await Promise.all([
    getSetting(env.DB, 'identities'),
    getSetting(env.DB, 'bg_image'),
    getAllContactsCount(env.DB),
    getSpamlistText(env.DB),
    getBlocklistText(env.DB)
  ])
  return new Response(renderSettingsPage(tab, identitiesRaw || '', bgImage || '', contactCount, spamText, blockText), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  })
})

export const handleSettingsSaveIdentities = withAuth(async (req, env) => {
  const formData = await req.formData()
  const raw = (formData.get('identities') || '').toString()
  const clean = formatIdentities(parseIdentities(raw))
  await setSetting(env.DB, 'identities', clean)
  return new Response(null, { status: 302, headers: { Location: '/settings?tab=identities' } })
})

export const handleSettingsSaveAppearance = withAuth(async (req, env) => {
  const formData = await req.formData()
  const bgImage = (formData.get('bg_image') || '').toString().trim()
  if (bgImage && !/^https?:\/\//i.test(bgImage)) {
    return new Response('bg_image must be a https:// URL', { status: 400 })
  }
  await setSetting(env.DB, 'bg_image', bgImage)
  return new Response(null, { status: 302, headers: { Location: '/settings?tab=appearance' } })
})

export const handleSettingsImportContacts = withAuth(async (req, env) => {
  const formData = await req.formData()
  const vcf = (formData.get('vcf') || '').toString()
  const contacts = parseVCards(vcf)
  await upsertContacts(env.DB, contacts)
  return new Response(null, { status: 302, headers: { Location: '/settings?tab=contacts' } })
})

export const handleSettingsClearContacts = withAuth(async (req, env) => {
  await deleteAllContacts(env.DB)
  return new Response(null, { status: 302, headers: { Location: '/settings?tab=contacts' } })
})

function parseFilterPatterns (raw) {
  return raw.split('\n').map((l) => l.trim()).filter(Boolean)
}

function validateFilterPatterns (patterns) {
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const wildcardRe = /^\*@[^\s@]+\.[^\s@]+$/
  const bad = patterns.filter((p) => !emailRe.test(p) && !wildcardRe.test(p))
  return bad
}

export const handleSettingsSaveFilters = withAuth(async (req, env) => {
  const formData = await req.formData()
  const spamPatterns = autoWildcard(parseFilterPatterns((formData.get('spamlist') || '').toString()))
  const blockPatterns = autoWildcard(parseFilterPatterns((formData.get('blocklist') || '').toString()))

  const badSpam = validateFilterPatterns(spamPatterns)
  const badBlock = validateFilterPatterns(blockPatterns)
  if (badSpam.length > 0 || badBlock.length > 0) {
    const all = [...badSpam, ...badBlock]
    return new Response(`Invalid pattern(s): ${all.join(', ')}`, { status: 400 })
  }

  await Promise.all([
    setSpamlist(env.DB, spamPatterns),
    setBlocklist(env.DB, blockPatterns)
  ])
  return new Response(null, { status: 302, headers: { Location: '/settings?tab=filters' } })
})
