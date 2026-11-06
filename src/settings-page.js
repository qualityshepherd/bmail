// Tab shell + the one /settings route. Each tab's own render/handle logic
// lives in its own settings-*.js file - this just picks which one to show.
import { withAuth } from './auth-routes.js'
import { getSetting, getSpamlistText, getBlocklistText, getKnownRecipientCount } from './db-admin.js'
import { getAllContactsCount } from './db-contacts.js'
import { escapeHtml } from './html.js'
import { renderIdentitiesTab } from './settings-identities.js'
import { renderAppearanceTab } from './settings-appearance.js'
import { renderContactsTab } from './settings-contacts.js'
import { renderFiltersTab } from './settings-filters.js'
import { renderExportTab } from './settings-export.js'

function renderSettingsPage (tab, identitiesRaw, bgImage, contactCount = 0, spamText = '', blockText = '', catchAllLockdown = false, knownRecipientCount = 0, showRemoteAvatars = false) {
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
      ? renderContactsTab(contactCount, showRemoteAvatars)
      : tab === 'filters'
        ? renderFiltersTab(spamText, blockText, catchAllLockdown, knownRecipientCount)
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

<link rel="icon" href="/bmail_36px.png" type="image/png" sizes="36x36">
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#BF5520">
<meta name="mobile-web-app-capable" content="yes">
<link rel="apple-touch-icon" href="/bmail_180px.png">
<link rel="stylesheet" href="/base.css">
<link rel="stylesheet" href="/settings.css">
</head>
<body${bodyAttr}>
  <header>
    <h1><a href="/inbox"><img src="/bmail_logo2.png" alt="" class="site-logo">Bmail</a></h1>
  </header>
  <div class="settings-wrap">
    <nav class="settings-tabs">${tabNav}</nav>
    ${content}
  </div>
  <script type="module" src="/settings.js"></script>
<script src="/sw-register.js" defer></script>
</body>
</html>`
}

export const handleSettingsPage = withAuth(async (req, env) => {
  const url = new URL(req.url)
  const tab = url.searchParams.get('tab') || 'identities'
  const [identitiesRaw, bgImage, contactCount, spamText, blockText, catchAllMode, knownRecipientCount, avatarPref] = await Promise.all([
    getSetting(env.DB, 'identities'),
    getSetting(env.DB, 'bg_image'),
    getAllContactsCount(env.DB),
    getSpamlistText(env.DB),
    getBlocklistText(env.DB),
    getSetting(env.DB, 'catchAllMode'),
    getKnownRecipientCount(env.DB),
    getSetting(env.DB, 'showRemoteAvatars')
  ])
  const catchAllLockdown = catchAllMode === 'known-only'
  const showRemoteAvatars = avatarPref === 'on'
  return new Response(renderSettingsPage(tab, identitiesRaw || '', bgImage || '', contactCount, spamText, blockText, catchAllLockdown, knownRecipientCount, showRemoteAvatars), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  })
})
