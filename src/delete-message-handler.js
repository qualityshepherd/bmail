import { withAuth } from './auth-routes.js'
import { getEmailById, getAttachmentR2Keys, deleteEmailsByIds } from './db.js'

// Only reachable from Trash - matches the "no auto-delete from Inbox/Archive"
// rule. A trashed message can still be hard-deleted one at a time, not just
// via the all-or-nothing "Empty Trash" bulk action.
export const handleDeleteMessage = withAuth(async (req, env, ctx, session, emailId) => {
  const email = await getEmailById(env.DB, emailId)
  if (!email || email.status !== 'trash') return new Response('Not found', { status: 404 })

  const r2Keys = await getAttachmentR2Keys(env.DB, [emailId])
  await deleteEmailsByIds(env.DB, [emailId])
  await Promise.all(r2Keys.map((key) => env.ATTACHMENTS.delete(key)))

  const formData = await req.formData()
  const back = (formData.get('back') || '').toString()
  return new Response(null, {
    status: 302,
    headers: { Location: (back.startsWith('/') && !back.startsWith('//')) ? back : '/inbox?q=trash%3A' }
  })
})
