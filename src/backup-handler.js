import { withAuth } from './auth-routes.js'
import { runManualBackup } from './backup.js'

export const handleManualBackup = withAuth(async (req, env) => {
  await runManualBackup(env)
  return new Response(null, { status: 302, headers: { Location: '/settings?tab=export' } })
})
