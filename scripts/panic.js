// Kills every currently active session immediately - use this the moment
// you suspect your Ed25519 private key or a session cookie is compromised.
// This does NOT require a redeploy and takes effect the instant it runs.
//
// This only protects the app-level auth layer (sessions/logins). It has
// no effect against a compromised Cloudflare account itself - see README
// for that threat model.
//
// Usage:
//   npm run panic            # wipes remote (production)
//   npm run panic -- --local # wipes local dev DB instead

import { execSync } from 'node:child_process'

const isLocal = process.argv.includes('--local')
const flag = isLocal ? '--local' : '--remote'

console.log(`\n🚨 Wiping all sessions and login attempts (${isLocal ? 'local' : 'REMOTE'})...\n`)

execSync(
  `npx wrangler d1 execute bmail ${flag} --command "DELETE FROM sessions"`,
  { stdio: 'inherit' }
)
execSync(
  `npx wrangler d1 execute bmail ${flag} --command "DELETE FROM login_attempts"`,
  { stdio: 'inherit' }
)
execSync(
  `npx wrangler d1 execute bmail ${flag} --command "DELETE FROM nonces"`,
  { stdio: 'inherit' }
)

console.log(`
Done. Every active session is dead - anyone with a stolen cookie is logged out now.

Next steps, if you believe the private key itself (not just a cookie) leaked:
  1. Blank AUTH_PUBKEY in wrangler.toml (or replace it with a freshly generated key)
  2. npm run deploy
`)
