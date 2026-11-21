import { withAuth } from './auth-routes.js'
import { upsertContacts, deleteAllContacts, getAllAvatarUrls, getAllContactRows } from './db-contacts.js'
import { parseVCards, toVCards } from './contacts.js'
import { cacheAvatars, reconcileAvatars } from './avatars.js'

export function renderContactsTab (contactCount) {
  const countLine = contactCount === 0
    ? '<p class="empty-hint">No contacts imported yet.</p>'
    : `<p class="settings-hint">${contactCount} contact${contactCount === 1 ? '' : 's'} stored.</p>`

  return `<section class="settings-section">
    <p class="settings-hint">Paste the contents of a <code>.vcf</code> file to import contacts.
       Names and photos are used in the inbox. Imported names and photos replace what's there,
       but a blank in the file never erases one. Anyone you send mail to is added too.
       Photos are downloaded once, here, and served from Bmail &mdash; your browser never
       requests anything from the host the vCard pointed at. Base64 photos are skipped;
       they may take a moment to appear after importing.</p>
    ${countLine}
    <form method="post" action="/settings/contacts">
      <textarea name="vcf" rows="5" placeholder="BEGIN:VCARD&#10;VERSION:3.0&#10;FN:Jane Smith&#10;EMAIL:jane@example.com&#10;PHOTO;VALUE=URI:https://example.com/jane.jpg&#10;END:VCARD"></textarea>
      <button type="submit" class="btn-outline">Import contacts</button>
    </form>
    ${contactCount > 0 ? '<p><a class="btn-outline" href="/settings/contacts/export" download>Export contacts (.vcf)</a></p>' : ''}
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

const MAX_VCF_LENGTH = 5 * 1024 * 1024

export const handleSettingsImportContacts = withAuth(async (req, env, ctx) => {
  const formData = await req.formData()
  const vcf = (formData.get('vcf') || '').toString()
  if (vcf.length > MAX_VCF_LENGTH) {
    return new Response('VCard import too large (max 5MB)', { status: 413 })
  }
  const contacts = parseVCards(vcf)
  await upsertContacts(env.DB, contacts)
  // in the background - a few hundred photos would hold the redirect open.
  // Sweep after, not before: the new ones are in the table by then, so the
  // only thing it drops is a photo somebody has since changed.
  ctx.waitUntil(
    cacheAvatars(env, contacts)
      .then(() => getAllAvatarUrls(env.DB))
      .then((urls) => reconcileAvatars(env, urls))
      .catch(() => {})
  )
  return new Response(null, { status: 302, headers: { Location: '/settings?tab=contacts' } })
})

export const handleSettingsClearContacts = withAuth(async (req, env, ctx) => {
  await deleteAllContacts(env.DB)
  // "This cannot be undone" has to mean the photos too, or clearing the
  // address book leaves everyone's face sitting in the bucket.
  ctx.waitUntil(reconcileAvatars(env, []).catch(() => {}))
  return new Response(null, { status: 302, headers: { Location: '/settings?tab=contacts' } })
})

export const handleSettingsExportContacts = withAuth(async (req, env) => {
  const vcf = toVCards(await getAllContactRows(env.DB))
  return new Response(vcf, {
    headers: {
      'Content-Type': 'text/vcard; charset=utf-8',
      'Content-Disposition': 'attachment; filename="bmail-contacts.vcf"',
      'Cache-Control': 'no-store'
    }
  })
})
