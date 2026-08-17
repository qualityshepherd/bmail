import { withAuth } from './auth-routes.js'
import { getAttachmentR2Keys, deleteEmailsByIds } from './db.js'

export const handleEmptySpam = withAuth(async (req, env) => {
  const { results } = await env.DB.prepare("SELECT id FROM emails WHERE status = 'spam'").all()
  const ids = results.map((r) => r.id)

  if (ids.length > 0) {
    const r2Keys = await getAttachmentR2Keys(env.DB, ids)
    await deleteEmailsByIds(env.DB, ids)
    await Promise.all(r2Keys.map((key) => env.ATTACHMENTS.delete(key)))
  }

  const formData = await req.formData()
  const back = (formData.get('back') || '').toString()
  return new Response(null, {
    status: 302,
    headers: { Location: (back.startsWith('/') && !back.startsWith('//')) ? back : '/inbox?q=spam%3A' }
  })
})
