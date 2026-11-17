import './details-menu.js'

const clearCacheLink = document.getElementById('clear-cache-link')
if (clearCacheLink) {
  clearCacheLink.addEventListener('click', async (e) => {
    e.preventDefault()
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    }
    const keys = await caches.keys()
    await Promise.all(keys.map((k) => caches.delete(k)))
    location.reload()
  })
}

// Only shown where the browser can actually do it (Chromium, Firefox; not
// Safari). The browser asks you to confirm, and undoing it lives in the
// browser's own settings, not here.
const mailtoBox = document.getElementById('mailto-handler')
if (mailtoBox && 'registerProtocolHandler' in navigator) {
  mailtoBox.hidden = false
  const msg = document.getElementById('mailto-handler-msg')
  document.getElementById('mailto-handler-btn').addEventListener('click', () => {
    try {
      navigator.registerProtocolHandler('mailto', `${location.origin}/compose?mailto=%s`)
      msg.textContent = 'Asked. If your browser showed a prompt, allow it. Brave and Chrome put it as an icon at the end of the address bar.'
    } catch (err) {
      msg.textContent = `The browser said no: ${err.message}`
    }
  })
}
