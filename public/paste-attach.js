// Pure clipboard-to-attachment logic, split out from compose.js so it's
// testable without a real browser paste event.

export function extractPastedImages (clipboardItems) {
  return [...clipboardItems]
    .filter((i) => i.kind === 'file' && i.type.startsWith('image/'))
    .map((i) => i.getAsFile())
    .filter(Boolean)
}

// Pasted images usually all share one generic name ("image.png"), and the
// attachment list keys by name - without this, the second paste would
// silently overwrite the first.
export function ensureFilename (file) {
  const dot = file.name.lastIndexOf('.')
  const hasExt = dot > 0
  const base = hasExt ? file.name.slice(0, dot) : 'pasted-image'
  const ext = hasExt ? file.name.slice(dot + 1) : (file.type.split('/')[1] || 'png')
  const suffix = crypto.randomUUID().slice(0, 8)
  return new File([file], `${base}-${suffix}.${ext}`, { type: file.type })
}
