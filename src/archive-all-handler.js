import { withAuth } from './auth-routes.js'

export const handleArchiveAll = withAuth(async (req, env) => {
  const formData = await req.formData()
  const back = (formData.get('back') || '').toString()

  await env.DB.prepare(
    "UPDATE emails SET status = 'archive', status_changed_at = ? WHERE status = 'inbox'"
  ).bind(Date.now()).run()

  return new Response(null, {
    status: 302,
    headers: { Location: (back.startsWith('/') && !back.startsWith('//')) ? back : '/inbox' }
  })
})
