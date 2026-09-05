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

function updateUnreadBadge (count) {
  document.title = count > 0 ? `(${count}) Bmail` : 'Bmail'
  const folderLinks = document.querySelector('.folder-links')
  if (!folderLinks) return
  const inboxLink = folderLinks.querySelector('a[href*="inbox%3A"]')
  if (!inboxLink) return
  let badge = inboxLink.querySelector('.folder-count')
  if (count > 0) {
    if (!badge) {
      badge = document.createElement('span')
      badge.className = 'folder-count'
      inboxLink.appendChild(badge)
    }
    badge.textContent = count
  } else if (badge) {
    badge.remove()
  }
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
  } else if (form.querySelector('.danger-icon') && !confirm('Permanently delete this message? This can\'t be undone.')) {
    e.preventDefault()
  }
})

const list = document.getElementById('email-list')
const sentinel = document.getElementById('scroll-sentinel')

if (list && list.dataset.newest && !list.dataset.query.startsWith('sent:')) {
  let newest = list.dataset.newest
  let newestId = list.dataset.newestId
  const query = list.dataset.query
  let polling = false

  async function poll () {
    if (document.hidden || polling) return
    polling = true
    try {
      const res = await fetch(
        `/inbox?q=${encodeURIComponent(query)}&after=${newest}&afterId=${newestId}`,
        { redirect: 'manual' }
      )
      // opaqueredirect = session expired, send to login
      if (res.type === 'opaqueredirect') { window.location.href = '/login'; return }
      if (!res.ok) return
      const html = await res.text()
      const newNewest = res.headers.get('X-Newest-Created-At')
      const newNewestId = res.headers.get('X-Newest-Id')
      const newUnread = res.headers.get('X-Unread-Count')
      if (html.trim() && newNewest) {
        list.insertAdjacentHTML('afterbegin', html)
        localizeDates(list)
        newest = newNewest
        newestId = newNewestId
      }
      if (newUnread !== null) updateUnreadBadge(Number(newUnread))
    } catch (err) {
      console.error('inbox poll failed:', err)
    } finally {
      polling = false
    }
  }

  setInterval(poll, 60000)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll() })
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

// Long-press to reveal row action icons on touch devices
;(function () {
  if (!('ontouchstart' in window)) return

  let timer = null
  let activeItem = null
  let suppressNext = false

  function dismiss () {
    if (activeItem) {
      activeItem.classList.remove('long-press-active')
      activeItem = null
    }
  }

  function cancelTimer () {
    if (timer) { clearTimeout(timer); timer = null }
  }

  document.addEventListener('touchstart', (e) => {
    cancelTimer()
    const item = e.target.closest('.email-item')
    if (!item) { dismiss(); return }
    timer = setTimeout(() => {
      timer = null
      dismiss()
      activeItem = item
      item.classList.add('long-press-active')
      suppressNext = true
    }, 500)
  }, { passive: true })

  document.addEventListener('touchmove', cancelTimer, { passive: true })
  document.addEventListener('touchend', cancelTimer, { passive: true })
  document.addEventListener('touchcancel', cancelTimer, { passive: true })

  // Capture-phase click: suppress navigation on the lift after a long-press,
  // and dismiss icons when tapping outside the active row's icon strip.
  document.addEventListener('click', (e) => {
    if (suppressNext) {
      suppressNext = false
      e.preventDefault()
      e.stopPropagation()
      return
    }
    if (activeItem) {
      if (e.target.closest('.row-icons')) {
        dismiss()
      } else if (!e.target.closest('.email-item.long-press-active')) {
        dismiss()
      }
    }
  }, true)
})()

// Close any open <details> on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('details[open]').forEach((d) => d.removeAttribute('open'))
  }
})

// Close any open <details> when clicking outside it
document.addEventListener('click', (e) => {
  document.querySelectorAll('details[open]').forEach((d) => {
    if (!d.contains(e.target)) d.removeAttribute('open')
  })
})
