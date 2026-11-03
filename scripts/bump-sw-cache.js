// Rewrites sw.js's CACHE version to a hash of the actual STATIC files, so
// the service worker only busts its cache when something in public/ really
// changed - not on every deploy. Runs automatically before `npm run deploy`
// (see package.json's "predeploy").
//
// Usage: node scripts/bump-sw-cache.js

import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const swPath = fileURLToPath(new URL('../public/sw.js', import.meta.url))
const publicDir = fileURLToPath(new URL('../public/', import.meta.url))

const swSource = readFileSync(swPath, 'utf8')

const staticMatch = swSource.match(/const STATIC = \[([\s\S]*?)\]/)
if (!staticMatch) {
  console.error('Could not find STATIC array in public/sw.js - nothing hashed.')
  process.exit(1)
}
const files = [...staticMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1])

const hash = createHash('sha256')
for (const path of files) {
  const content = readFileSync(publicDir + path.replace(/^\//, ''))
  hash.update(path).update(content)
}
const version = hash.digest('hex').slice(0, 8)

const updated = swSource.replace(/const CACHE = '[^']*'/, `const CACHE = 'bmail-${version}'`)
if (updated === swSource) {
  console.log(`sw.js cache already up to date (bmail-${version})`)
} else {
  writeFileSync(swPath, updated)
  console.log(`sw.js cache bumped to bmail-${version}`)
}
