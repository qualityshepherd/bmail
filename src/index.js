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
  deleteExpiredLoginAttempts
} from './db.js'
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
  'Content-Security-Policy': "default-src 'self'; img-src 'self' https: blob:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'"
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

export default {
  async email (message, env, ctx) {
    try {
      await ingestEmail({
        message,
        env,
        deepLinkBaseUrl: env.DEEP_LINK_BASE_URL || 'https://bmail.example.com'
      })
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

    let response
    try {
      if (method === 'GET' && pathname === '/api/challenge') {
        response = await handleChallenge(request, env)
      } else if (method === 'POST' && pathname === '/api/login') {
        response = await handleLogin(request, env)
      } else if (method === 'POST' && pathname === '/api/logout') {
        response = await handleLogout(request, env)
      } else if (method === 'GET' && pathname === '/api/me') {
        response = await handleMe(request, env)
      } else if (method === 'GET' && pathname === '/inbox') {
        response = await handleInbox(request, env, ctx)
      } else if (method === 'GET' && pathname === '/compose') {
        response = await handleComposePage(request, env, ctx)
      } else if (method === 'POST' && pathname === '/compose') {
        response = await handleCompose(request, env, ctx)
      } else if (method === 'GET' && pathname === '/settings') {
        response = await handleSettingsPage(request, env, ctx)
      } else if (method === 'POST' && pathname === '/settings/identities') {
        response = await handleSettingsSaveIdentities(request, env, ctx)
      } else if (method === 'POST' && pathname === '/settings/appearance') {
        response = await handleSettingsSaveAppearance(request, env, ctx)
      } else if (method === 'POST' && pathname === '/settings/contacts') {
        response = await handleSettingsImportContacts(request, env, ctx)
      } else if (method === 'POST' && pathname === '/settings/contacts/clear') {
        response = await handleSettingsClearContacts(request, env, ctx)
      } else if (method === 'POST' && pathname === '/settings/filters') {
        response = await handleSettingsSaveFilters(request, env, ctx)
      } else if (method === 'GET' && pathname === '/identities') {
        response = new Response(null, { status: 302, headers: { Location: '/settings?tab=identities' } })
      } else if (method === 'POST' && REPLY_PATTERN.test(request.url)) {
        const { id } = REPLY_PATTERN.exec(request.url).pathname.groups
        response = await handleReply(request, env, ctx, id)
      } else if (method === 'POST' && STAR_PATTERN.test(request.url)) {
        const { id } = STAR_PATTERN.exec(request.url).pathname.groups
        response = await handleStarToggle(request, env, ctx, id)
      } else if (method === 'POST' && BLOCK_PATTERN.test(request.url)) {
        const { id } = BLOCK_PATTERN.exec(request.url).pathname.groups
        response = await handleBlockSender(request, env, ctx, id)
      } else if (method === 'POST' && STATUS_PATTERN.test(request.url)) {
        const { id } = STATUS_PATTERN.exec(request.url).pathname.groups
        response = await handleStatusChange(request, env, ctx, id)
      } else if (method === 'POST' && SPAM_RECIPIENT_PATTERN.test(request.url)) {
        const { id } = SPAM_RECIPIENT_PATTERN.exec(request.url).pathname.groups
        response = await handleSpamRecipient(request, env, ctx, id)
      } else if (method === 'POST' && TAGS_PATTERN.test(request.url)) {
        const { id } = TAGS_PATTERN.exec(request.url).pathname.groups
        response = await handleTagsChange(request, env, ctx, id)
      } else if (method === 'GET' && ATTACHMENT_PATTERN.test(request.url)) {
        const { id, attachmentId } = ATTACHMENT_PATTERN.exec(request.url).pathname.groups
        response = await handleAttachmentDownload(request, env, ctx, id, attachmentId)
      } else if (method === 'POST' && pathname === '/trash/empty') {
        response = await handleEmptyTrash(request, env, ctx)
      } else if (method === 'POST' && pathname === '/spam/empty') {
        response = await handleEmptySpam(request, env, ctx)
      } else if (method === 'POST' && pathname === '/inbox/mark-all-read') {
        response = await handleMarkAllRead(request, env, ctx)
      } else if (method === 'POST' && pathname === '/inbox/archive-all') {
        response = await handleArchiveAll(request, env, ctx)
      } else if (method === 'GET' && pathname === '/export/mbox') {
        response = await handleMboxExport(request, env)
      } else if (method === 'POST' && pathname === '/backup/run') {
        response = await handleManualBackup(request, env)
      } else if (method === 'POST' && DELETE_SENT_PATTERN.test(request.url)) {
        const { id } = DELETE_SENT_PATTERN.exec(request.url).pathname.groups
        response = await handleDeleteSent(request, env, ctx, id)
      } else if (method === 'GET' && SENT_PATTERN.test(request.url)) {
        const { id } = SENT_PATTERN.exec(request.url).pathname.groups
        response = await handleSentView(request, env, ctx, id)
      } else if (method === 'GET' && FORWARD_PATTERN.test(request.url)) {
        const { id } = FORWARD_PATTERN.exec(request.url).pathname.groups
        response = await handleForwardPage(request, env, ctx, id)
      } else if (method === 'GET' && MESSAGE_PATTERN.test(request.url)) {
        const { id } = MESSAGE_PATTERN.exec(request.url).pathname.groups
        response = await handleMessageView(request, env, ctx, id)
      } else if (!env.AUTH_PUBKEY) {
        // No owner key configured yet - show the setup form on every route
        // rather than a bare 404, since there's nothing useful to protect
        // or display until this is done. setup.css/setup.js are real static
        // files under public/, served directly by Cloudflare's assets layer
        // (see [assets] in wrangler.toml) - they never reach this handler.
        response = new Response(renderSetupPage(), { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
      } else if (method === 'GET' && pathname === '/login') {
        response = new Response(renderLoginPage(), { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
      } else if (method === 'GET' && pathname === '/') {
        // AUTH_PUBKEY is set and there's no dedicated login page yet, so
        // send people straight to the inbox - withAuth() there already
        // 401s correctly if there's no valid session.
        // NOTE: deliberately NOT using Response.redirect() here - it
        // returns a response with immutable headers, which throws when
        // the shared security-header loop below tries to set() on it.
        response = new Response(null, {
          status: 302,
          headers: { Location: new URL('/inbox', request.url).toString() }
        })
      } else {
        response = new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
      }
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
  const row = await env.DB.prepare(
    "SELECT COUNT(*) as count FROM emails WHERE status = 'inbox' AND read = 0"
  ).first()
  const count = row ? row.count : 0
  if (count === 0) return
  const identitiesRaw = await env.DB.prepare("SELECT value FROM settings WHERE key = 'identities'").first()
  const from = identitiesRaw ? (identitiesRaw.value || '').split('\n')[0].split(',')[0].trim() : env.FALLBACK_EMAIL
  const base = (env.DEEP_LINK_BASE_URL || '').replace(/\/$/, '')
  const payload = `${count} unread · ${base}/inbox`
  await sendSms(env, payload, from)
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
