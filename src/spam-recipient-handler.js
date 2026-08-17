import { withAuth } from './auth-routes.js'
import { getEmailById, setStatus, getSpamPatterns, setSpamlist } from './db.js'
import { autoWildcard } from './filters.js'

export const handleSpamRecipient = withAuth(async (req, env, ctx, session, emailId) => {
  const email = await getEmailById(env.DB, emailId)
  if (!email) return new Response('Not found', { status: 404 })

  const existing = await getSpamPatterns(env.DB)
  await Promise.all([
    setStatus(env.DB, emailId, 'spam', Date.now()),
    setSpamlist(env.DB, autoWildcard([...existing, email.recipient]))
  ])

  const formData = await req.formData()
  const formBack = (formData.get('back') || '').toString()
  return new Response(null, {
    status: 302,
    headers: { Location: (formBack.startsWith('/') && !formBack.startsWith('//')) ? formBack : '/inbox' }
  })
})
