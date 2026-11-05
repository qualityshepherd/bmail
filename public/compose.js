import './details-menu.js'
import { setupAttachments, esc } from './attachments.js'

// ─── CC / BCC toggles ─────────────────────────────────────
const showCcBtn = document.getElementById('show-cc')
const showBccBtn = document.getElementById('show-bcc')
const ccRow = document.getElementById('cc-row')
const bccRow = document.getElementById('bcc-row')
const addrToggles = document.getElementById('addr-toggles')

function showAddrRow (row, btn) {
  row.classList.remove('compose-hidden')
  btn.remove()
  if (addrToggles && !addrToggles.children.length) {
    addrToggles.classList.add('compose-hidden')
  }
  const input = row.querySelector('input')
  if (input) input.focus()
}

if (showCcBtn && ccRow) showCcBtn.addEventListener('click', () => showAddrRow(ccRow, showCcBtn))
if (showBccBtn && bccRow) showBccBtn.addEventListener('click', () => showAddrRow(bccRow, showBccBtn))

// ─── Address autocomplete ─────────────────────────────────
const datalist = document.getElementById('addr-datalist')
const allContacts = datalist ? [...datalist.options].map((o) => o.value) : []

function lastToken (val) {
  const comma = val.lastIndexOf(',')
  return comma === -1 ? val.trimStart() : val.slice(comma + 1).trimStart()
}

function replaceLastToken (val, replacement) {
  const comma = val.lastIndexOf(',')
  return (comma === -1 ? '' : val.slice(0, comma + 1) + ' ') + replacement
}

function matchContacts (token) {
  if (!token) return []
  const lower = token.toLowerCase()
  return allContacts.filter((c) => c.toLowerCase().includes(lower)).slice(0, 6)
}

function attachAutocomplete (inputId) {
  const input = document.getElementById(inputId)
  if (!input || !allContacts.length) return

  const wrap = document.createElement('div')
  wrap.className = 'addr-field-wrap'
  input.parentNode.insertBefore(wrap, input)
  wrap.appendChild(input)

  const dropdown = document.createElement('ul')
  dropdown.className = 'addr-dropdown'
  wrap.appendChild(dropdown)

  let activeIdx = -1
  let matches = []

  function hide () {
    dropdown.classList.remove('open')
    activeIdx = -1
    matches = []
  }

  function render () {
    dropdown.innerHTML = matches.map((m, i) =>
      `<li data-idx="${i}"${i === activeIdx ? ' class="active"' : ''}>${esc(m)}</li>`
    ).join('')
    dropdown.classList.toggle('open', matches.length > 0)
  }

  function select (m) {
    input.value = replaceLastToken(input.value, m) + ', '
    hide()
    input.dispatchEvent(new Event('input'))
  }

  input.addEventListener('input', () => {
    matches = matchContacts(lastToken(input.value))
    activeIdx = -1
    render()
  })

  input.addEventListener('keydown', (e) => {
    if (!dropdown.classList.contains('open')) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      activeIdx = Math.min(activeIdx + 1, matches.length - 1)
      render()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      activeIdx = Math.max(activeIdx - 1, -1)
      render()
    } else if (e.key === 'Tab' || e.key === 'Enter') {
      const pick = activeIdx >= 0 ? matches[activeIdx] : matches[0]
      if (pick) { e.preventDefault(); select(pick) }
    } else if (e.key === 'Escape') {
      hide()
    }
  })

  dropdown.addEventListener('mousedown', (e) => {
    const li = e.target.closest('li[data-idx]')
    if (li) { e.preventDefault(); select(matches[Number(li.dataset.idx)]) }
  })

  input.addEventListener('blur', () => setTimeout(hide, 150))
}

attachAutocomplete('to')
attachAutocomplete('cc')
attachAutocomplete('bcc')

// ─── Address validation ────────────────────────────────────
function extractBareEmail (val) {
  const m = val.match(/<([^>]+)>/)
  return m ? m[1].trim() : val.trim()
}

function looksLikeEmail (val) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(extractBareEmail(val))
}

function validateAddressField (input, errorEl) {
  const val = input.value.trim()
  if (!val) { errorEl.textContent = ''; return true }
  const addrs = val.split(',').map((s) => s.trim()).filter(Boolean)
  const bad = addrs.find((a) => !looksLikeEmail(a))
  if (bad) { errorEl.textContent = `Not a valid address: ${bad}`; return false }
  errorEl.textContent = ''
  return true
}

function attachValidation (inputId) {
  const input = document.getElementById(inputId)
  if (!input) return
  const errorEl = document.createElement('span')
  errorEl.className = 'field-error'
  errorEl.setAttribute('aria-live', 'polite')
  const row = input.closest('.compose-row')
  if (row) row.after(errorEl)
  input.addEventListener('blur', () => validateAddressField(input, errorEl))
  input.addEventListener('input', () => { if (errorEl.textContent) errorEl.textContent = '' })
}

attachValidation('to')
attachValidation('cc')
attachValidation('bcc')

// ─── Attachment management ─────────────────────────────────
const sendError = document.getElementById('compose-send-error')

function showSendError (msg) {
  if (sendError) sendError.textContent = msg
}

setupAttachments({
  fileInput: document.getElementById('file-input'),
  browseBtn: document.getElementById('browse-btn'),
  fileList: document.getElementById('file-list'),
  maxFileBytes: 15 * 1024 * 1024,
  maxTotalBytes: 40 * 1024 * 1024,
  onError: (msg) => alert(msg)
})

// ─── Fetch-based submit (required for File objects) ────────
const composeForm = document.getElementById('compose-form')
const sendBtn = document.getElementById('send-btn')

async function doSubmit () {
  showSendError('')
  const subjectVal = (document.getElementById('subject')?.value || '').trim()
  const bodyVal = (document.getElementById('body')?.value || '').trim()
  if (!subjectVal && !confirm('No subject — this may look like spam. Send anyway?')) return
  if (!bodyVal && !confirm('Body is empty. Send anyway?')) return
  // setupAttachments keeps the real file input synced, so this just works.
  const formData = new FormData(composeForm)
  if (sendBtn) sendBtn.disabled = true
  try {
    const res = await fetch('/compose', { method: 'POST', body: formData })
    if (res.redirected) {
      window.location.href = res.url
    } else if (res.ok) {
      window.location.href = '/inbox'
    } else {
      const text = await res.text()
      const msg = text.length < 200 ? text : 'Send failed (' + res.status + ')'
      showSendError(msg)
      if (sendBtn) sendBtn.disabled = false
    }
  } catch (err) {
    showSendError('Send failed: ' + err.message)
    if (sendBtn) sendBtn.disabled = false
  }
}

if (composeForm) {
  composeForm.addEventListener('submit', (e) => { e.preventDefault(); doSubmit() })
  composeForm.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); doSubmit() }
  })
}
