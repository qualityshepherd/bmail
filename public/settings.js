document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    document.querySelectorAll('details[open]').forEach(function (d) {
      d.removeAttribute('open')
    })
  }
})

const clearCacheLink = document.getElementById('clear-cache-link')
if (clearCacheLink) {
  clearCacheLink.addEventListener('click', async function (e) {
    e.preventDefault()
    const keys = await caches.keys()
    await Promise.all(keys.map((k) => caches.delete(k)))
    location.reload()
  })
}
