// Wallpapers live in one setting, one url per line. A line starting with *
// means "use this one" - if anything is starred the pick comes from the
// starred lines, so one star pins and several rotate among themselves. No
// stars rotates the lot. One rule, no second switch to keep in sync.
//
//   https://a.jpg
//   *https://b.jpg      <- this one, every day
//   https://c.jpg
//
// Rotation is daily, not per page load. This is a mail client you click
// around in constantly and a wallpaper that changes on every navigation
// reads as a glitch. Round-robin on days-since-epoch, so every image gets
// its turn and none repeats until the others have had theirs.

const DAY_MS = 86400000

export function parseBackgrounds (raw) {
  const entries = String(raw || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const pinned = line.startsWith('*')
      return { url: (pinned ? line.slice(1) : line).trim(), pinned }
    })
    .filter((e) => /^https?:\/\//i.test(e.url))

  const starred = entries.filter((e) => e.pinned)
  return {
    all: entries.map((e) => e.url),
    pool: (starred.length ? starred : entries).map((e) => e.url)
  }
}

// '' when there's nothing to show - every render site already treats that
// as "no background", so an empty setting keeps behaving the way it did.
export function pickBackground (raw, now = Date.now()) {
  const { pool } = parseBackgrounds(raw)
  if (pool.length === 0) return ''
  return pool[Math.floor(now / DAY_MS) % pool.length]
}

// Returns the offending line, or null when every line is a usable url.
// Catches the paste-a-bare-domain case before it silently vanishes from
// the rotation, which is what filtering alone would do.
export function findInvalidBackground (raw) {
  for (const line of String(raw || '').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const url = (trimmed.startsWith('*') ? trimmed.slice(1) : trimmed).trim()
    if (!/^https?:\/\//i.test(url)) return trimmed
  }
  return null
}
