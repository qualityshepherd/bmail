function localizeDate (ts) {
  const date = new Date(Number(ts))
  const isThisYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: isThisYear ? undefined : 'numeric'
  })
}

function localizeTitle (ts) {
  return new Date(Number(ts)).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  })
}

function localizeDates (root) {
  const scope = root || document
  scope.querySelectorAll('.row-date[data-ts]').forEach((el) => {
    el.textContent = localizeDate(el.dataset.ts)
  })
  scope.querySelectorAll('a.email-row[data-ts]').forEach((el) => {
    el.title = localizeTitle(el.dataset.ts)
  })
}

localizeDates()

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

if (list && list.dataset.newest) {
  let newest = list.dataset.newest
  let newestId = list.dataset.newestId
  const query = list.dataset.query

  setInterval(async () => {
    if (document.hidden) return
    try {
      const res = await fetch(`/inbox?q=${encodeURIComponent(query)}&after=${newest}&afterId=${newestId}`)
      if (!res.ok) return
      const html = await res.text()
      const newNewest = res.headers.get('X-Newest-Created-At')
      const newNewestId = res.headers.get('X-Newest-Id')
      if (html.trim() && newNewest) {
        list.insertAdjacentHTML('afterbegin', html)
        localizeDates(list)
        newest = newNewest
        newestId = newNewestId
      }
    } catch (err) {
      console.error('inbox poll failed:', err)
    }
  }, 60000)
}

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
