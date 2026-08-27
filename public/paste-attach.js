// Pure clipboard-to-attachment logic, split out from compose.js so it's
// testable without a real browser paste event.

export function extractPastedImages (clipboardItems) {
  return [...clipboardItems]
    .filter((i) => i.kind === 'file' && i.type.startsWith('image/'))
    .map((i) => i.getAsFile())
    .filter(Boolean)
}

// The OS/browser gives pasted clipboard images a generic placeholder name
// (commonly literally "image.png"), not a genuinely distinct filename - so
// unlike drag-and-drop or browsed files, a paste's name can't be trusted to
// be unique. The attachment list keys files by name, so without always
// uniquifying here, a second pasted screenshot named "image.png" silently
// overwrites the first in that Map.
export function ensureFilename (file) {
  const dot = file.name.lastIndexOf('.')
  const hasExt = dot > 0
  const base = hasExt ? file.name.slice(0, dot) : 'pasted-image'
  const ext = hasExt ? file.name.slice(dot + 1) : (file.type.split('/')[1] || 'png')
  const suffix = crypto.randomUUID().slice(0, 8)
  return new File([file], `${base}-${suffix}.${ext}`, { type: file.type })
}
