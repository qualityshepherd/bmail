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

// Close any open <details> when clicking outside it
document.addEventListener('click', (e) => {
  document.querySelectorAll('details[open]').forEach((d) => {
    if (!d.contains(e.target)) d.removeAttribute('open')
  })
})

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

// Delete-forever icon (trash icon, repurposed, only shown while already in
// Trash) - confirm before submitting since there's no undo.
document.addEventListener('submit', (e) => {
  if (e.target.querySelector('.danger-icon') && !confirm('Permanently delete this message? This can\'t be undone.')) {
    e.preventDefault()
  }
})
