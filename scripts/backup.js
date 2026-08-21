// Exports Bmail's D1 database to a local file. R2 attachment blobs are
// NOT included — only the metadata (filename, r2_key, size) is in D1.
// If you need attachment blobs in your backup strategy, set up a separate
// R2 sync job or download attachments before deleting emails.
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
