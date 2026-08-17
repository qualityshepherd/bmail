import { withAuth } from './auth-routes.js'
import { getEmailById, setStatus, getSpamPatterns, setSpamlist } from './db.js'
import { autoWildcard } from './filters.js'

const VALID_STATUSES = new Set(['inbox', 'archive', 'spam', 'trash'])

export const handleStatusChange = withAuth(async (req, env, ctx, session, emailId) => {
  const email = await getEmailById(env.DB, emailId)
  if (!email) return new Response('Not found', { status: 404 })

  const formData = await req.formData()
  const status = (formData.get('status') || '').toString()
  if (!VALID_STATUSES.has(status)) return new Response('Bad request', { status: 400 })

  await setStatus(env.DB, emailId, status, Date.now())
  if (status === 'spam') {
    const existing = await getSpamPatterns(env.DB)
    await setSpamlist(env.DB, autoWildcard([...existing, email.sender]))
  }

  // Return to wherever the action was taken from - a row's own form posts
  // include a `back` field with the current inbox URL (filter preserved);
  // the message view's forms do the same with their own return target.
  const formBack = (formData.get('back') || '').toString()
  return new Response(null, {
    status: 302,
    headers: { Location: (formBack.startsWith('/') && !formBack.startsWith('//')) ? formBack : '/inbox' }
  })
})
