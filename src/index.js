/* global URLPattern */
import { ingestEmail, sendSms } from './pipeline.js'
import {
  getStaleAttachments,
  deleteAttachmentsByIds,
  getStaleTrashSpamIds,
  deleteEmailsByIds,
  getAttachmentR2Keys,
  deleteExpiredNonces,
  deleteExpiredSessions,
  deleteExpiredLoginAttempts,
  getUnreadInboxCount
} from './db.js'
import { buildSmsPayload } from './notifications.js'
import { handleChallenge, handleLogin, handleLogout, handleMe } from './auth-routes.js'
import { handleInbox } from './inbox.js'
import { handleMessageView } from './message-view.js'
import { handleAttachmentDownload } from './attachment-download.js'
import { handleReply } from './reply-handler.js'
import { handleStarToggle } from './star-handler.js'
import { handleBlockSender } from './block-handler.js'
import { handleStatusChange } from './status-handler.js'
import { handleSpamRecipient } from './spam-recipient-handler.js'
import { handleTagsChange } from './tags-handler.js'
import { handleComposePage, handleForwardPage } from './compose-page.js'
import { handleCompose } from './compose-handler.js'
import { handleDeleteSent } from './delete-sent-handler.js'
import { handleEmptyTrash } from './empty-trash-handler.js'
import { handleEmptySpam } from './empty-spam-handler.js'
import { handleMarkAllRead } from './mark-read-handler.js'
import { handleArchiveAll } from './archive-all-handler.js'
import { handleSettingsPage, handleSettingsSaveIdentities, handleSettingsSaveAppearance, handleSettingsImportContacts, handleSettingsClearContacts, handleSettingsSaveFilters } from './settings-page.js'
import { handleSentView } from './sent-view.js'
import { handleUnsubscribe } from './unsubscribe-handler.js'
import { handleMboxExport } from './export-handler.js'
import { runDailyBackup } from './backup.js'
import { handleManualBackup } from './backup-handler.js'
import { renderSetupPage } from './setup-page.js'
import { renderLoginPage } from './login-page.js'

const ATTACHMENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
const TRASH_SPAM_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
const FIVE_MINUTES_MS = 5 * 60 * 1000
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000

const PLAIN_SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; connect-src 'self' https://cloudflareinsights.com; img-src 'self' https: blob:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'"
}

const SENT_PATTERN = new URLPattern({ pathname: '/sent/:id' })
const DELETE_SENT_PATTERN = new URLPattern({ pathname: '/sent/:id/delete' })
const MESSAGE_PATTERN = new URLPattern({ pathname: '/message/:id' })
const FORWARD_PATTERN = new URLPattern({ pathname: '/message/:id/forward' })
const ATTACHMENT_PATTERN = new URLPattern({ pathname: '/message/:id/attachment/:attachmentId' })
const REPLY_PATTERN = new URLPattern({ pathname: '/message/:id/reply' })
const STAR_PATTERN = new URLPattern({ pathname: '/message/:id/star' })
const BLOCK_PATTERN = new URLPattern({ pathname: '/message/:id/block' })
const STATUS_PATTERN = new URLPattern({ pathname: '/message/:id/status' })
const SPAM_RECIPIENT_PATTERN = new URLPattern({ pathname: '/message/:id/spam-recipient' })
const TAGS_PATTERN = new URLPattern({ pathname: '/message/:id/tags' })
const UNSUBSCRIBE_PATTERN = new URLPattern({ pathname: '/message/:id/unsubscribe' })

const ROUTES = [
  ['GET', '/api/challenge', (req, env) => handleChallenge(req, env)],
  ['POST', '/api/login', (req, env) => handleLogin(req, env)],
  ['POST', '/api/logout', (req, env) => handleLogout(req, env)],
  ['GET', '/api/me', (req, env) => handleMe(req, env)],
  ['GET', '/inbox', (req, env, ctx) => handleInbox(req, env, ctx)],
  ['GET', '/compose', (req, env, ctx) => handleComposePage(req, env, ctx)],
  ['POST', '/compose', (req, env, ctx) => handleCompose(req, env, ctx)],
  ['GET', '/settings', (req, env, ctx) => handleSettingsPage(req, env, ctx)],
  ['POST', '/settings/identities', (req, env, ctx) => handleSettingsSaveIdentities(req, env, ctx)],
  ['POST', '/settings/appearance', (req, env, ctx) => handleSettingsSaveAppearance(req, env, ctx)],
  ['POST', '/settings/contacts', (req, env, ctx) => handleSettingsImportContacts(req, env, ctx)],
  ['POST', '/settings/contacts/clear', (req, env, ctx) => handleSettingsClearContacts(req, env, ctx)],
  ['POST', '/settings/filters', (req, env, ctx) => handleSettingsSaveFilters(req, env, ctx)],
  ['POST', '/trash/empty', (req, env, ctx) => handleEmptyTrash(req, env, ctx)],
  ['POST', '/spam/empty', (req, env, ctx) => handleEmptySpam(req, env, ctx)],
  ['POST', '/inbox/mark-all-read', (req, env, ctx) => handleMarkAllRead(req, env, ctx)],
  ['POST', '/inbox/archive-all', (req, env, ctx) => handleArchiveAll(req, env, ctx)],
  ['GET', '/export/mbox', (req, env) => handleMboxExport(req, env)],
  ['POST', '/backup/run', (req, env) => handleManualBackup(req, env)],
  ['GET', '/login', () => new Response(renderLoginPage(), { headers: { 'Content-Type': 'text/html; charset=utf-8' } })],
  ['GET', '/', (req) => new Response(null, { status: 302, headers: { Location: new URL('/inbox', req.url).toString() } })],
  ['GET', '/identities', () => new Response(null, { status: 302, headers: { Location: '/settings?tab=identities' } })],
  // Pattern routes — matched against full URL, groups forwarded to handler
  ['POST', REPLY_PATTERN, (req, env, ctx, m) => handleReply(req, env, ctx, m.pathname.groups.id)],
  ['POST', STAR_PATTERN, (req, env, ctx, m) => handleStarToggle(req, env, ctx, m.pathname.groups.id)],
  ['POST', BLOCK_PATTERN, (req, env, ctx, m) => handleBlockSender(req, env, ctx, m.pathname.groups.id)],
  ['POST', STATUS_PATTERN, (req, env, ctx, m) => handleStatusChange(req, env, ctx, m.pathname.groups.id)],
  ['POST', SPAM_RECIPIENT_PATTERN, (req, env, ctx, m) => handleSpamRecipient(req, env, ctx, m.pathname.groups.id)],
  ['POST', TAGS_PATTERN, (req, env, ctx, m) => handleTagsChange(req, env, ctx, m.pathname.groups.id)],
  ['POST', UNSUBSCRIBE_PATTERN, (req, env, ctx, m) => handleUnsubscribe(req, env, ctx, m.pathname.groups.id)],
  ['GET', ATTACHMENT_PATTERN, (req, env, ctx, m) => handleAttachmentDownload(req, env, ctx, m.pathname.groups.id, m.pathname.groups.attachmentId)],
  ['POST', DELETE_SENT_PATTERN, (req, env, ctx, m) => handleDeleteSent(req, env, ctx, m.pathname.groups.id)],
  ['GET', SENT_PATTERN, (req, env, ctx, m) => handleSentView(req, env, ctx, m.pathname.groups.id)],
  ['GET', FORWARD_PATTERN, (req, env, ctx, m) => handleForwardPage(req, env, ctx, m.pathname.groups.id)],
  ['GET', MESSAGE_PATTERN, (req, env, ctx, m) => handleMessageView(req, env, ctx, m.pathname.groups.id)]
]

async function route (request, env, ctx, method, pathname) {
  for (const [routeMethod, pattern, handler] of ROUTES) {
    if (method !== routeMethod) continue
    const match = typeof pattern === 'string'
      ? (pathname === pattern ? {} : null)
      : pattern.exec(request.url)
    if (match === null) continue
    return handler(request, env, ctx, match)
  }
  return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}

export default {
  async email (message, env, ctx) {
    try {
      await ingestEmail({ message, env })
    } catch (err) {
      console.error('Bmail ingestion failed, forwarding to fallback:', err)
      // Per spec 2.5: never lose mail. Forward the raw message on any
      // parsing or database failure rather than swallowing it.
      if (message.canBeForwarded) {
        await message.forward(env.FALLBACK_EMAIL)
      }
    }
  },

  async scheduled (event, env, ctx) {
    ctx.waitUntil(runMaintenance(env))
    ctx.waitUntil(runHourlyDigest(env))
    ctx.waitUntil(runDailyBackup(env))
  },

  async fetch (request, env, ctx) {
    const url = new URL(request.url)
    const { pathname } = url
    const method = request.method

    // Special case: no pubkey = first-run setup, show setup page everywhere.
    if (!env.AUTH_PUBKEY) {
      return new Response(renderSetupPage(), { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    }

    let response
    try {
      response = await route(request, env, ctx, method, pathname)
    } catch (err) {
      // Without this, an unhandled throw anywhere in routing just becomes
      // an opaque 500 with zero context - console.error here means
      // `wrangler tail` actually shows what broke and where.
      console.error(`Bmail fetch() error on ${method} ${pathname}:`, err)
      response = new Response('Internal Server Error', { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
    }

    for (const [key, value] of Object.entries(PLAIN_SECURITY_HEADERS)) {
      response.headers.set(key, value)
    }
    return response
  }
}

async function runHourlyDigest (env) {
  if (!env.SMS_GATEWAY_ADDRESS) return
  const unreadCount = await getUnreadInboxCount(env.DB)
  if (unreadCount === 0) return
  const url = `https://bmail.${env.EMAIL_DOMAIN}/inbox`
  await sendSms(env, buildSmsPayload({ unreadCount, url }))
}

async function runMaintenance (env) {
  const now = Date.now()

  // Attachment blobs age out of R2 after ATTACHMENT_RETENTION_MS from the
  // email's ORIGINAL arrival - applies to every email regardless of status.
  // The email row and its metadata are untouched here.
  const staleAttachments = await getStaleAttachments(env.DB, now - ATTACHMENT_RETENTION_MS)
  const attachmentDeletes = await Promise.allSettled(staleAttachments.map((a) => env.ATTACHMENTS.delete(a.r2_key)))
  attachmentDeletes.forEach((r, i) => { if (r.status === 'rejected') console.error('R2 attachment delete failed:', staleAttachments[i].r2_key, r.reason) })
  await deleteAttachmentsByIds(env.DB, staleAttachments.map((a) => a.id))

  // Separately: emails sitting in Trash/Spam for TRASH_SPAM_RETENTION_MS
  // since being MOVED there (not since original arrival - status_changed_at,
  // not created_at) get fully deleted - row, cascaded attachment rows, FTS
  // index entry. This is the one place email rows are ever deleted at all;
  // Inbox/Archive emails are never touched by any cleanup job.
  const staleTrashSpamIds = await getStaleTrashSpamIds(env.DB, now - TRASH_SPAM_RETENTION_MS)
  const r2KeysToDelete = await getAttachmentR2Keys(env.DB, staleTrashSpamIds)
  await deleteEmailsByIds(env.DB, staleTrashSpamIds)
  const trashDeletes = await Promise.allSettled(r2KeysToDelete.map((key) => env.ATTACHMENTS.delete(key)))
  trashDeletes.forEach((r, i) => { if (r.status === 'rejected') console.error('R2 trash delete failed:', r2KeysToDelete[i], r.reason) })

  await deleteExpiredNonces(env.DB, now - FIVE_MINUTES_MS)
  await deleteExpiredSessions(env.DB, now - TWENTY_FOUR_HOURS_MS)
  await deleteExpiredLoginAttempts(env.DB, now)
}
