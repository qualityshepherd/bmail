// Exports Bmail's D1 database to a local file. R2 (attachments) is
// deliberately NOT backed up - the 30-day retention window already makes
// attachments ephemeral by design (see README), so there's nothing durable
// to protect there. If you ever need an attachment back, ask the sender to
// resend it or download it before the 30-day window closes.
//
// Usage:
//   npm run backup            # backs up remote (production)
//   npm run backup -- --local # backs up local dev DB instead

import { execSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const isLocal = process.argv.includes('--local')
const flag = isLocal ? '--local' : '--remote'

mkdirSync('backups', { recursive: true })

const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
const outFile = `backups/bmail-${isLocal ? 'local' : 'remote'}-${timestamp}.sql`

console.log(`\nExporting D1 (${isLocal ? 'local' : 'REMOTE'}) to ${outFile}...\n`)

execSync(
  `npx wrangler d1 export bmail ${flag} --output=${outFile}`,
  { stdio: 'inherit' }
)

console.log(`\nDone: ${outFile}`)
