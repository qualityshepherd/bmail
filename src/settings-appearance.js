import { withAuth } from './auth-routes.js'
import { setSetting } from './db-admin.js'
import { escapeHtml } from './html.js'
import { parseBackgrounds, findInvalidBackground } from './backgrounds.js'

export function renderAppearanceTab (bgImage) {
  const { all, pool } = parseBackgrounds(bgImage)

  const status = all.length === 0
    ? '<p class="empty-hint">No background set.</p>'
    : pool.length === 1
      ? `<p class="settings-hint">Showing one of ${all.length}${all.length > 1 ? ' (starred)' : ''}.</p>`
      : `<p class="settings-hint">Rotating through ${pool.length} of ${all.length}, a new one each day.</p>`

  return `<section class="settings-section">
    <p class="settings-hint">Background images, one URL per line. Leave blank for none.
       Several rotate daily; start a line with <code>*</code> to always use that one.</p>
    <form method="post" action="/settings/appearance">
      <textarea name="bg_image" rows="5" spellcheck="false"
                placeholder="https://example.com/wallpaper.jpg&#10;*https://example.com/favourite.jpg">${escapeHtml(bgImage)}</textarea>
      <button type="submit" class="btn-outline">Save appearance</button>
    </form>
    ${status}
    <a href="#" id="clear-cache-link" class="btn-outline">Clear cache &amp; reload</a>
    <div id="mailto-handler" hidden>
      <p class="settings-hint">Make email links on other sites open here instead of a desktop mail app.</p>
      <button type="button" id="mailto-handler-btn" class="btn-outline">Open email links in bmail</button>
      <p class="settings-hint" id="mailto-handler-msg" role="status"></p>
    </div>
  </section>`
}

export const handleSettingsSaveAppearance = withAuth(async (req, env) => {
  const formData = await req.formData()
  const bgImage = (formData.get('bg_image') || '').toString().trim()
  const bad = findInvalidBackground(bgImage)
  if (bad) {
    return new Response(`Not a http(s) URL: ${bad}`, { status: 400 })
  }
  await setSetting(env.DB, 'bg_image', bgImage)
  return new Response(null, { status: 302, headers: { Location: '/settings?tab=appearance' } })
})
