document.addEventListener('submit', (e) => {
  const form = e.target
  if (form.id === 'empty-trash-form') {
    if (!confirm('Permanently delete all trashed messages?')) e.preventDefault()
  } else if (form.id === 'empty-spam-form') {
    if (!confirm('Permanently delete all spam?')) e.preventDefault()
  }
})

const list = document.getElementById('email-list')
const sentinel = document.getElementById('scroll-sentinel')

if (list && sentinel) {
  let loading = false
  let hasMore = true
  let oldest = list.dataset.oldest
  let oldestId = list.dataset.oldestId
  const query = list.dataset.query

  const observer = new IntersectionObserver(async (entries) => {
    if (!entries[0].isIntersecting) return
    if (loading || !hasMore || !oldest) return

    loading = true
    try {
      const res = await fetch(`/inbox?q=${encodeURIComponent(query)}&before=${oldest}&beforeId=${oldestId}`)
      if (!res.ok) throw new Error(`fetch failed: ${res.status}`)

      const html = await res.text()
      const newOldest = res.headers.get('X-Oldest-Created-At')
      const newOldestId = res.headers.get('X-Oldest-Id')
      hasMore = res.headers.get('X-Has-More') === 'true'

      if (!html.trim() || !newOldest) {
        hasMore = false
      } else {
        list.insertAdjacentHTML('beforeend', html)
        oldest = newOldest
        oldestId = newOldestId
      }
    } catch (err) {
      console.error('infinite scroll load failed:', err)
      hasMore = false
    }
    loading = false
  }, { rootMargin: '400px' })

  observer.observe(sentinel)
}
