// Shared attachment picker: drag-drop (page-wide), browse button, paste,
// file-list rendering with image previews, size limits. Used by compose.js
// and message.js (reply) - elements are passed in since ids differ per page.
//
// Keeps the real <input type=file> synced to the tracked file Map via
// DataTransfer, so a plain native form submit (multipart/form-data) just
// works - callers that build their own FormData (compose.js) can read the
// Map directly instead.

import { extractPastedImages, ensureFilename } from './paste-attach.js'

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

export function setupAttachments ({ fileInput, browseBtn, fileList, maxFileBytes, maxTotalBytes, onError }) {
  const attachedFiles = new Map()
  const previewUrls = new Map()
  const reportError = onError || ((msg) => alert(msg))

  function syncFileInput () {
    if (!fileInput) return
    const dt = new DataTransfer()
    for (const file of attachedFiles.values()) dt.items.add(file)
    fileInput.files = dt.files
  }

  function renderFileList () {
    if (!fileList) return
    for (const [name, url] of previewUrls) {
      if (!attachedFiles.has(name)) { URL.revokeObjectURL(url); previewUrls.delete(name) }
    }
    fileList.innerHTML = ''
    for (const [name, file] of attachedFiles) {
      const isImage = file.type.startsWith('image/') && file.type !== 'image/svg+xml'
      if (isImage && !previewUrls.has(name)) previewUrls.set(name, URL.createObjectURL(file))
      const li = document.createElement('li')
      if (isImage) {
        const link = document.createElement('a')
        link.href = previewUrls.get(name)
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
        const img = document.createElement('img')
        img.src = previewUrls.get(name)
        img.className = 'attach-thumb'
        img.alt = ''
        link.appendChild(img)
        li.appendChild(link)
      }
      const meta = document.createElement('span')
      meta.className = 'attach-meta'
      meta.innerHTML = esc(name) + ' <small>(' + fmtSize(file.size) + ')</small>'
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.setAttribute('aria-label', 'Remove ' + name)
      btn.textContent = '×'
      btn.addEventListener('click', () => {
        if (previewUrls.has(name)) { URL.revokeObjectURL(previewUrls.get(name)); previewUrls.delete(name) }
        attachedFiles.delete(name)
        syncFileInput()
        renderFileList()
      })
      li.appendChild(meta)
      li.appendChild(btn)
      fileList.appendChild(li)
    }
  }

  function addFiles (newFiles) {
    const errs = []
    for (const file of newFiles) {
      if (file.size > maxFileBytes) {
        errs.push(file.name + ' exceeds ' + fmtSize(maxFileBytes))
        continue
      }
      attachedFiles.set(file.name, file)
    }
    const total = [...attachedFiles.values()].reduce((s, f) => s + f.size, 0)
    if (total > maxTotalBytes) errs.push('Total attachments exceed ' + fmtSize(maxTotalBytes))
    if (errs.length) reportError(errs.join('\n'))
    syncFileInput()
    renderFileList()
  }

  // ─── Full-page drop overlay ────────────────────────────────
  const dropOverlay = document.createElement('div')
  dropOverlay.className = 'drop-overlay'
  dropOverlay.textContent = 'Drop to attach'
  document.body.appendChild(dropOverlay)

  let dragDepth = 0
  document.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer || !e.dataTransfer.types.includes('Files')) return
    dragDepth++
    dropOverlay.classList.add('active')
  })
  document.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1)
    if (dragDepth === 0) dropOverlay.classList.remove('active')
  })
  document.addEventListener('dragover', (e) => {
    if (e.dataTransfer && e.dataTransfer.types.includes('Files')) e.preventDefault()
  })
  document.addEventListener('drop', (e) => {
    dragDepth = 0
    dropOverlay.classList.remove('active')
    if (e.dataTransfer && e.dataTransfer.files.length) {
      e.preventDefault()
      addFiles(e.dataTransfer.files)
    }
  })

  if (browseBtn && fileInput) {
    browseBtn.addEventListener('click', () => fileInput.click())
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length) addFiles(fileInput.files)
    })
  }

  // ─── Paste to attach ────────────────────────────────────────
  document.addEventListener('paste', (e) => {
    const images = extractPastedImages(e.clipboardData?.items || [])
    if (!images.length) return
    addFiles(images.map(ensureFilename))
  })

  return { attachedFiles, addFiles }
}
