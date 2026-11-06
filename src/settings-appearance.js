import { withAuth } from './auth-routes.js'
import { setSetting } from './db-admin.js'
import { escapeHtml } from './html.js'

export function renderAppearanceTab (bgImage) {
  return `<section class="settings-section">
    <p class="settings-hint">Background image URL (leave blank for none).</p>
    <form method="post" action="/settings/appearance">
      <input type="url" name="bg_image" value="${escapeHtml(bgImage)}"
             placeholder="https://example.com/wallpaper.jpg" autocomplete="off">
      <button type="submit" class="btn-outline">Save appearance</button>
    </form>
    <a href="#" id="clear-cache-link" class="btn-outline">Clear cache &amp; reload</a>
  </section>`
}

export const handleSettingsSaveAppearance = withAuth(async (req, env) => {
  const formData = await req.formData()
  const bgImage = (formData.get('bg_image') || '').toString().trim()
  if (bgImage && !/^https?:\/\//i.test(bgImage)) {
    return new Response('bg_image must be a https:// URL', { status: 400 })
  }
  await setSetting(env.DB, 'bg_image', bgImage)
  return new Response(null, { status: 302, headers: { Location: '/settings?tab=appearance' } })
})
