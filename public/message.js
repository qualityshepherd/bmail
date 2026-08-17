/* global confirm */
const replyBody = document.getElementById('body')
const replyForm = document.querySelector('.reply-form')

if (replyBody && replyForm) {
  replyBody.addEventListener('keydown', (e) => {
    const isSubmitCombo = (e.metaKey || e.ctrlKey) && e.key === 'Enter'
    if (isSubmitCombo) {
      e.preventDefault()
      replyForm.requestSubmit()
    }
  })
}

// Arrow-key prev/next, respecting whatever filter the message was reached
// from (see message-view.js - prevHref/nextHref already carry the `back`
// query forward). Never hijacks arrow keys while typing in a text field -
// that would be a real way to lose a half-written reply.
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

// Tags auto-save on blur via fetch — avoids the full page reload that
// requestSubmit() would trigger, which would nuke focus if the user clicks
// the reply textarea immediately after editing a tag.
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

// Close any open <details> on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('details[open]').forEach((d) => d.removeAttribute('open'))
  }
})

// Block sender - confirm before submitting, since it's a real destructive
// action (adds a permanent blocklist entry + trashes this message).
const blockForm = document.getElementById('block-form')
if (blockForm) {
  blockForm.addEventListener('submit', (e) => {
    const sender = blockForm.dataset.sender || 'this sender'
    if (!confirm(`Block ${sender} and trash this message?`)) {
      e.preventDefault()
    }
  })
}
