import { buildMbox } from './export-handler.js'

export function sqlVal (v) {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number') return String(v)
  return `'${String(v).replace(/'/g, "''")}'`
}

async function dumpTable (db, table, cols) {
  const { results } = await db.prepare(`SELECT ${cols.join(', ')} FROM ${table}`).all()
  if (!results.length) return ''
  const colList = cols.join(', ')
  return results.map((row) =>
    `INSERT INTO ${table} (${colList}) VALUES (${cols.map((c) => sqlVal(row[c])).join(', ')});`
  ).join('\n') + '\n'
}

// emails must come before attachments (FK: email_id → emails.id)
const TABLES = [
  ['emails', ['id', 'sender', 'recipient', 'subject', 'body', 'message_id', 'in_reply_to', 'created_at', 'sender_display', 'starred', 'status', 'status_changed_at', 'read', 'tags', 'cc', 'dmarc_result']],
  ['attachments', ['id', 'email_id', 'filename', 'content_type', 'r2_key', 'size']],
  ['sent', ['id', 'message_id', 'from_address', 'to_address', 'subject', 'body', 'in_reply_to', 'created_at', 'cc_address', 'bcc_address', 'send_status', 'send_error']],
  ['blocklist', ['id', 'pattern']],

  ['contacts', ['email', 'name', 'avatar_url']],
  ['settings', ['key', 'value']]
]

async function writeBackup (env) {
  const date = new Date().toISOString().slice(0, 10)
  let sql = `-- Bmail backup ${date}\n`
  sql += '-- Restore: wrangler d1 migrations apply bmail --remote\n'
  sql += '--          wrangler d1 execute bmail --remote --file=this-file.sql\n\n'
  sql += 'PRAGMA foreign_keys = OFF;\n\n'

  for (const [table, cols] of TABLES) {
    const chunk = await dumpTable(env.DB, table, cols)
    if (chunk) {
      sql += `-- ${table}\n${chunk}\n`
    }
  }

  sql += 'PRAGMA foreign_keys = ON;\n'

  await env.ATTACHMENTS.put(`backups/bmail-${date}.sql`, sql, {
    httpMetadata: { contentType: 'text/plain; charset=utf-8' }
  })
}

export async function runDailyBackup (env) {
  if (new Date().getUTCHours() !== 7) return // 00:42 MDT (UTC-7)
  await writeBackup(env)
}

export async function runManualBackup (env) {
  await writeBackup(env)
}

export async function runMonthlyMboxBackup (env) {
  const now = new Date()
  if (now.getUTCDate() !== 1 || now.getUTCHours() !== 7) return
  const month = now.toISOString().slice(0, 7) // YYYY-MM
  const mbox = await buildMbox(env.DB)
  await env.ATTACHMENTS.put(`backups/bmail-${month}.mbox`, mbox, {
    httpMetadata: { contentType: 'application/mbox' }
  })
}
