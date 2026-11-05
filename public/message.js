import './details-menu.js'
import { setupAttachments } from './attachments.js'

const replyBody = document.getElementById('body')
const replyForm = document.getElementById('reply-form')

// Same picker Compose uses - drag-drop, paste, browse.
setupAttachments({
  fileInput: document.getElementById('file-input'),
  browseBtn: document.getElementById('browse-btn'),
  fileList: document.getElementById('file-list'),
  maxFileBytes: 15 * 1024 * 1024,
  maxTotalBytes: 40 * 1024 * 1024,
  onError: (msg) => alert(msg)
})

// ─── Local time ───────────────────────────────────────────
// Server renders in UTC - swap in the real local time, same as inbox.js.
function localizeTitle (ts) {
  return new Date(Number(ts)).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  })
}

const msgDate = document.querySelector('.msg-date[data-ts]')
if (msgDate) msgDate.textContent = localizeTitle(msgDate.dataset.ts)

if (replyBody && replyBody.dataset.quoteTs) {
  replyBody.value = replyBody.value.replace('__QUOTE_DATE__', localizeTitle(replyBody.dataset.quoteTs))
}

// ─── Reply disclosure ─────────────────────────────────────
// Reply all is just Reply with data-cc pre-filled - the server sees one shape.
const replyOpen = document.getElementById('reply-open')
const replyCcRow = document.getElementById('reply-cc-row')
const replyCc = document.getElementById('reply-cc')

function openReply (cc) {
  if (!replyForm) return
  replyForm.hidden = false
  if (replyOpen) replyOpen.hidden = true
  if (cc && replyCc && replyCcRow) {
    replyCc.value = cc
    replyCcRow.classList.remove('reply-hidden')
    const btn = document.getElementById('reply-show-cc')
    if (btn) btn.remove()
  }
  if (replyBody) {
    replyBody.focus()
    // Caret above the quote, not below it.
    replyBody.setSelectionRange(0, 0)
    replyBody.scrollTop = 0
  }
}

for (const id of ['reply-btn', 'reply-all-btn']) {
  const btn = document.getElementById(id)
  if (btn) btn.addEventListener('click', () => openReply(btn.dataset.cc))
}

const replyCancel = document.getElementById('reply-cancel')
if (replyCancel && replyForm) {
  replyCancel.addEventListener('click', () => {
    replyForm.hidden = true
    if (replyOpen) replyOpen.hidden = false
  })
}

// Cc / Bcc toggles - same shape as compose.js
function showReplyRow (rowId, btnId) {
  const row = document.getElementById(rowId)
  const btn = document.getElementById(btnId)
  if (!row || !btn) return
  btn.addEventListener('click', () => {
    row.classList.remove('reply-hidden')
    btn.remove()
    const input = row.querySelector('input')
    if (input) input.focus()
  })
}
showReplyRow('reply-cc-row', 'reply-show-cc')
showReplyRow('reply-bcc-row', 'reply-show-bcc')

if (replyBody && replyForm) {
  replyBody.addEventListener('keydown', (e) => {
    const isSubmitCombo = (e.metaKey || e.ctrlKey) && e.key === 'Enter'
    if (isSubmitCombo) {
      e.preventDefault()
      replyForm.requestSubmit()
    }
  })
}

// Arrow-key prev/next - skip while typing, don't eat a half-written reply.
document.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase()
  if (tag === 'textarea' || tag === 'input') return

  const prevHref = document.body.dataset.prevHref
  const nextHref = document.body.dataset.nextHref

  if (e.key === 'ArrowLeft' && prevHref) {
    window.location.href = prevHref
  } else if (e.key === 'ArrowRight' && nextHref) {
    window.location.href = nextHref
  }
})

// Tags auto-save on blur via fetch - a full submit would reload the page.
const tagsInput = document.getElementById('tags')
const tagsForm = document.getElementById('tags-form')
if (tagsInput && tagsForm) {
  let savedValue = tagsInput.value
  tagsInput.addEventListener('blur', () => {
    if (tagsInput.value === savedValue) return
    const formData = new FormData(tagsForm)
    fetch(tagsForm.action, { method: 'POST', body: formData })
      .then(() => { savedValue = tagsInput.value })
      .catch((err) => console.error('Tag save failed:', err))
  })
}

// Traffic menu — confirm destructive actions before submitting
const trafficPanel = document.querySelector('.traffic-panel')
if (trafficPanel) {
  trafficPanel.addEventListener('submit', (e) => {
    const action = e.target.action || ''
    if (action.includes('/block') && !confirm('Block this sender permanently?')) {
      e.preventDefault()
    } else if (action.includes('/spam-recipient') && !confirm('Always spam messages to this address?')) {
      e.preventDefault()
    }
  })
}

// Delete-forever (trash icon, repurposed) - no undo, so confirm first.
document.addEventListener('submit', (e) => {
  if (e.target.querySelector('.danger-icon') && !confirm('Permanently delete this message? This can\'t be undone.')) {
    e.preventDefault()
  }
})
