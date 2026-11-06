import { withAuth } from './auth-routes.js'
import { setSetting } from './db-admin.js'
import { upsertContacts, deleteAllContacts } from './db-contacts.js'
import { parseVCards } from './contacts.js'

export function renderContactsTab (contactCount, showRemoteAvatars) {
  const countLine = contactCount === 0
    ? '<p class="empty-hint">No contacts imported yet.</p>'
    : `<p class="settings-hint">${contactCount} contact${contactCount === 1 ? '' : 's'} stored.</p>`

  return `<section class="settings-section">
    <p class="settings-hint">Paste the contents of a <code>.vcf</code> file to import contacts.
       Names and avatar URLs are used in the inbox. New contacts are added; existing overwritten. Base64 photos are skipped.</p>
    ${countLine}
    <form method="post" action="/settings/contacts">
      <textarea name="vcf" rows="5" placeholder="BEGIN:VCARD&#10;VERSION:3.0&#10;FN:Jane Smith&#10;EMAIL:jane@example.com&#10;PHOTO;VALUE=URI:https://example.com/jane.jpg&#10;END:VCARD"></textarea>
      <button type="submit" class="btn-outline">Import contacts</button>
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
    <h3>Remote avatars</h3>
    <p class="settings-hint">Off by default: a contact's avatar URL is remote content, and just viewing
       a message from them would otherwise make your browser fetch it - a passive way for someone to
       know when their mail gets opened.</p>
    <form method="post" action="/settings/contacts/avatars">
      <label>
        <input type="checkbox" name="showRemoteAvatars" value="1"${showRemoteAvatars ? ' checked' : ''}>
        Load contact avatar images from remote URLs
      </label>
      <button type="submit" class="btn-outline">Save</button>
    </form>
  </section>`
}

const MAX_VCF_LENGTH = 5 * 1024 * 1024

export const handleSettingsImportContacts = withAuth(async (req, env) => {
  const formData = await req.formData()
  const vcf = (formData.get('vcf') || '').toString()
  if (vcf.length > MAX_VCF_LENGTH) {
    return new Response('VCard import too large (max 5MB)', { status: 413 })
  }
  const contacts = parseVCards(vcf)
  await upsertContacts(env.DB, contacts)
  return new Response(null, { status: 302, headers: { Location: '/settings?tab=contacts' } })
})

export const handleSettingsClearContacts = withAuth(async (req, env) => {
  await deleteAllContacts(env.DB)
  return new Response(null, { status: 302, headers: { Location: '/settings?tab=contacts' } })
})

export const handleSettingsSaveAvatarPref = withAuth(async (req, env) => {
  const formData = await req.formData()
  const showRemoteAvatars = formData.get('showRemoteAvatars') === '1' ? 'on' : 'off'
  await setSetting(env.DB, 'showRemoteAvatars', showRemoteAvatars)
  return new Response(null, { status: 302, headers: { Location: '/settings?tab=contacts' } })
})
