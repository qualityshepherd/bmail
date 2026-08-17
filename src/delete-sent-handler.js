import { withAuth } from './auth-routes.js'
import { getSentById, deleteSentById } from './db.js'

export const handleDeleteSent = withAuth(async (req, env, ctx, session, sentId) => {
  const sent = await getSentById(env.DB, sentId)
  if (!sent) return new Response('Not found', { status: 404 })

  await deleteSentById(env.DB, sentId)

  const formData = await req.formData()
  const back = (formData.get('back') || '').toString()
  return new Response(null, {
    status: 302,
    headers: { Location: (back.startsWith('/') && !back.startsWith('//')) ? back : '/inbox?q=sent%3A' }
  })
})
