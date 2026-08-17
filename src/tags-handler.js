import { withAuth } from './auth-routes.js'
import { getEmailById, setTags } from './db.js'
import { parseTags, formatTags } from './search.js'

export const handleTagsChange = withAuth(async (req, env, ctx, session, emailId) => {
  const email = await getEmailById(env.DB, emailId)
  if (!email) return new Response('Not found', { status: 404 })

  const formData = await req.formData()
  const raw = (formData.get('tags') || '').toString()
  // Normalize through parse/format so stray commas, extra whitespace, etc.
  // from a hand-edited text field don't accumulate garbage over time.
  const clean = formatTags(parseTags(raw))

  await setTags(env.DB, emailId, clean || null)

  const back = (formData.get('back') || '').toString()
  return new Response(null, {
    status: 302,
    headers: { Location: (back.startsWith('/') && !back.startsWith('//')) ? back : `/message/${emailId}` }
  })
})
