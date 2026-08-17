/* global IntersectionObserver, confirm */

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
  const query = list.dataset.query

  const observer = new IntersectionObserver(async (entries) => {
    if (!entries[0].isIntersecting) return
    if (loading || !hasMore || !oldest) return

    loading = true
    try {
      const res = await fetch(`/inbox?q=${encodeURIComponent(query)}&before=${oldest}`)
      if (!res.ok) throw new Error(`fetch failed: ${res.status}`)

      const html = await res.text()
      const newOldest = res.headers.get('X-Oldest-Created-At')
      hasMore = res.headers.get('X-Has-More') === 'true'

      if (!html.trim() || !newOldest) {
        hasMore = false
      } else {
        list.insertAdjacentHTML('beforeend', html)
        oldest = newOldest
      }
    } catch (err) {
      console.error('infinite scroll load failed:', err)
      hasMore = false
    }
    loading = false
  }, { rootMargin: '400px' })

  observer.observe(sentinel)
}
