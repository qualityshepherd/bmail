document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    document.querySelectorAll('details[open]').forEach(function (d) {
      d.removeAttribute('open')
    })
  }
})

document.addEventListener('click', function (e) {
  document.querySelectorAll('details[open]').forEach(function (d) {
    if (!d.contains(e.target)) d.removeAttribute('open')
  })
})

const clearCacheLink = document.getElementById('clear-cache-link')
if (clearCacheLink) {
  clearCacheLink.addEventListener('click', async function (e) {
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
