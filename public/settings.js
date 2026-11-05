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
