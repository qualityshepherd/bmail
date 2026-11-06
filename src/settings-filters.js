import { withAuth } from './auth-routes.js'
import { setSpamlist, setBlocklist, setSetting } from './db-admin.js'
import { escapeHtml } from './html.js'

export function renderFiltersTab (spamText, blockText, catchAllLockdown, knownRecipientCount) {
  return `<section class="settings-section">
    <p class="settings-hint">One pattern per line.</p>
    <form method="post" action="/settings/filters">
      <label for="spamlist">Spam list — always deliver to Spam</label>
      <textarea id="spamlist" name="spamlist" rows="5" placeholder="shadyrv@example.com&#10;*@marketing.example.com">${escapeHtml(spamText)}</textarea>
      <label for="blocklist">Block list — silently drop, never stored</label>
      <textarea id="blocklist" name="blocklist" rows="5" placeholder="troll@example.com&#10;*@spam.example.com">${escapeHtml(blockText)}</textarea>
      <h3>Catch-all lockdown</h3>
      <p class="settings-hint">${knownRecipientCount} address${knownRecipientCount === 1 ? '' : 'es'} have received real mail
         and are on the allow-list. Use this if the catch-all address gets bombed with mail to
         made-up local-parts - anything not already on that list gets silently dropped, before it's
         even parsed or stored.</p>
      <label>
        <input type="checkbox" name="catchAllLockdown" value="1"${catchAllLockdown ? ' checked' : ''}>
        Only accept mail to addresses that have already received real mail
      </label>
      <button type="submit" class="btn-outline">Save filters</button>
    </form>
    <p class="settings-hint pattern-examples">
      <span class="pattern-examples-heading">Patterns</span><br>
      <code>foo@example.com</code> exact address<br>
      <code>*@example.com</code> all addresses at that domain<br>
      <code>example.com</code> that domain and all subdomains<br>
      <code>*Good Sense RV*</code> substring match on full From header
    </p>
  </section>`
}

function parseFilterPatterns (raw) {
  return raw.split('\n').map((l) => l.trim()).filter(Boolean)
}

function validateFilterPatterns (patterns) {
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const wildcardRe = /^\*@[^\s@]+\.[^\s@]+$/
  const domainRe = /^[^\s@*]+\.[^\s@*]+$/
  const globRe = /\*/
  const bad = patterns.filter((p) => !emailRe.test(p) && !wildcardRe.test(p) && !domainRe.test(p) && !globRe.test(p))
  return bad
}

export const handleSettingsSaveFilters = withAuth(async (req, env) => {
  const formData = await req.formData()
  const spamPatterns = parseFilterPatterns((formData.get('spamlist') || '').toString())
  const blockPatterns = parseFilterPatterns((formData.get('blocklist') || '').toString())

  const badSpam = validateFilterPatterns(spamPatterns)
  const badBlock = validateFilterPatterns(blockPatterns)
  if (badSpam.length > 0 || badBlock.length > 0) {
    const all = [...badSpam, ...badBlock]
    return new Response(`Invalid pattern(s): ${all.join(', ')}`, { status: 400 })
  }

  const catchAllMode = formData.get('catchAllLockdown') === '1' ? 'known-only' : 'open'

  await Promise.all([
    setSpamlist(env.DB, spamPatterns),
    setBlocklist(env.DB, blockPatterns),
    setSetting(env.DB, 'catchAllMode', catchAllMode)
  ])
  return new Response(null, { status: 302, headers: { Location: '/settings?tab=filters' } })
})
