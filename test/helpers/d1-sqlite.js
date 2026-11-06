// we run src/db-*.js functions (D1) against Node's real built-in SQLite.
// Real migrations, real queries. No fucking mocks!

import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// creates a node sqlite db in memory for testing.
export function createTestDb () {
  const sqlite = new DatabaseSync(':memory:')
  const migrationsDir = fileURLToPath(new URL('../../migrations/', import.meta.url))
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
    sqlite.exec(readFileSync(migrationsDir + file, 'utf8'))
  }

  // Node SQLite and Cloudflare D1 have slightly different interfaces so we
  // wrap it to make Node SQLite behave like D1...
  function wrap (stmt, rawArgs) {
    const args = rawArgs.map((a) => (a === undefined ? null : a))
    return {
      all: async () => ({ results: stmt.all(...args) }), // get multiple records
      first: async () => stmt.get(...args) || null, // get one record
      run: async () => {
        const r = stmt.run(...args)
        return { meta: { last_row_id: r.lastInsertRowid, changes: r.changes } }
      }
    }
  }

  const db = {
    prepare (sql) {
      const stmt = sqlite.prepare(sql)
      return { bind: (...args) => wrap(stmt, args), ...wrap(stmt, []) }
    },
    // d1 supports batching so we do too...
    async batch (stmts) {
      sqlite.exec('BEGIN')
      try {
        const results = []
        for (const s of stmts) results.push(await s.run())
        sqlite.exec('COMMIT')
        return results
      } catch (err) {
        sqlite.exec('ROLLBACK')
        throw err
      }
    }
  }

  return db
}
