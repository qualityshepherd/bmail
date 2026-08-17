import { withAuth } from './auth-routes.js'
import { getEmailById, addBlocklistPattern, setStatus } from './db.js'

export const handleBlockSender = withAuth(async (req, env, ctx, session, emailId) => {
  const email = await getEmailById(env.DB, emailId)
  if (!email) return new Response('Not found', { status: 404 })

  await addBlocklistPattern(env.DB, email.sender)
  // Blocking someone while looking at their email - the obvious expected
  // outcome is also getting this one out of your inbox, not just
  // preventing future mail.
  await setStatus(env.DB, emailId, 'trash', Date.now())

  return new Response(null, {
    status: 302,
    headers: { Location: '/inbox' }
  })
})
