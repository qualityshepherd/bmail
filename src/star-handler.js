import { withAuth } from './auth-routes.js'
import { getEmailById, setStarred } from './db.js'

export const handleStarToggle = withAuth(async (req, env, ctx, session, emailId) => {
  const email = await getEmailById(env.DB, emailId)
  if (!email) return new Response('Not found', { status: 404 })

  await setStarred(env.DB, emailId, !email.starred)

  const formData = await req.formData()
  const back = (formData.get('back') || '').toString()
  const location = (back.startsWith('/') && !back.startsWith('//')) ? back : `/message/${emailId}`

  return new Response(null, {
    status: 302,
    headers: { Location: location }
  })
})
