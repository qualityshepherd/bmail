/* global alert */

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
const MAX_FILE_BYTES = 15 * 1024 * 1024
const MAX_TOTAL_BYTES = 40 * 1024 * 1024

const attachedFiles = new Map()
const dropZone = document.getElementById('drop-zone')
const fileInput = document.getElementById('file-input')
const browseBtn = document.getElementById('browse-btn')
const fileList = document.getElementById('file-list')
const sendError = document.getElementById('compose-send-error')

function esc (str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function fmtSize (bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}

function renderFileList () {
  if (!fileList) return
  fileList.innerHTML = ''
  for (const [name, file] of attachedFiles) {
    const li = document.createElement('li')
    li.innerHTML = '<span>' + esc(name) + ' <small>(' + fmtSize(file.size) + ')</small></span>' +
      '<button type="button" data-name="' + esc(name) + '" aria-label="Remove ' + esc(name) + '">×</button>'
    li.querySelector('button').addEventListener('click', () => {
      attachedFiles.delete(name)
      renderFileList()
    })
    fileList.appendChild(li)
  }
}

function showSendError (msg) {
  if (sendError) sendError.textContent = msg
}

function addFiles (newFiles) {
  const errs = []
  for (const file of newFiles) {
    if (file.size > MAX_FILE_BYTES) {
      errs.push(file.name + ' exceeds 15MB')
      continue
    }
    attachedFiles.set(file.name, file)
  }
  const total = [...attachedFiles.values()].reduce((s, f) => s + f.size, 0)
  if (total > MAX_TOTAL_BYTES) errs.push('Total attachments exceed 40MB')
  if (errs.length) alert(errs.join('\n'))
  renderFileList()
}

if (dropZone) {
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over') })
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'))
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault()
    dropZone.classList.remove('drag-over')
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
  })
}

if (browseBtn && fileInput) {
  browseBtn.addEventListener('click', () => fileInput.click())
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) addFiles(fileInput.files)
    fileInput.value = ''
  })
}

// ─── Fetch-based submit (required for File objects) ────────
const composeForm = document.getElementById('compose-form')
const sendBtn = document.getElementById('send-btn')

async function doSubmit () {
  showSendError('')
  const formData = new FormData(composeForm)
  // Replace the file input's entries with our tracked Map
  formData.delete('attachments')
  for (const [name, file] of attachedFiles) {
    formData.append('attachments', file, name)
  }
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
