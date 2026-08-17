import { withAuth } from './auth-routes.js'

export const handleMarkAllRead = withAuth(async (req, env) => {
  const formData = await req.formData()
  const status = (formData.get('status') || '').toString().trim()
  const back = (formData.get('back') || '').toString()

  const allowed = ['inbox', 'archive', 'spam', 'trash']
  if (allowed.includes(status)) {
    await env.DB.prepare('UPDATE emails SET read = 1 WHERE status = ? AND read = 0')
      .bind(status).run()
  } else {
    await env.DB.prepare('UPDATE emails SET read = 1 WHERE read = 0').run()
  }

  return new Response(null, {
    status: 302,
    headers: { Location: (back.startsWith('/') && !back.startsWith('//')) ? back : '/inbox' }
  })
})
