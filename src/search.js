// Pure: turns raw search-box text into structured filters. Knows nothing
// about defaults (e.g. "empty query means Inbox") - that policy decision
// belongs to the route handler, not the parser. AND-only by design, no
// OR, no NOT - see project discussion on why that's the right call for
// how this is actually used.
//
// Recognized tokens (space-separated):
//   all:              matches every status (Inbox/Archive/Spam/Trash)
//   inbox: archive: spam: trash:   short-form status filters
//   status:<value>    long-form fallback, still accepted
//   sent:             sent mail (can be combined with free-text: "sent: test")
//   tag:<value>        repeatable - all given tags must be present (AND)
//   is:starred        starred emails only
// Anything else is treated as free-text joined for FTS5 MATCH (subject/body).
export function parseSearchQuery (query) {
  const filters = { all: false, sent: false, status: null, tags: [], starred: false, text: '' }
  const textParts = []

  // Tokenize respecting quoted tag values: tag:"multi word" or tag:'multi word'
  const re = /tag:"([^"]*)"|tag:'([^']*)'|tag:(\S+)|(\S+)/g
  let m
  while ((m = re.exec((query || '').trim())) !== null) {
    const tagVal = m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]
    if (tagVal !== undefined) {
      if (tagVal) filters.tags.push(tagVal)
      continue
    }
    const token = m[4]
    if (token === 'all:') {
      filters.all = true
    } else if (token === 'sent:') {
      filters.sent = true
    } else if (token === 'inbox:' || token === 'archive:' || token === 'spam:' || token === 'trash:') {
      filters.status = token.slice(0, -1)
    } else if (token.startsWith('status:')) {
      filters.status = token.slice('status:'.length)
    } else if (token === 'starred:' || token === 'is:starred') {
      filters.starred = true
    } else {
      // Strip trailing ':' — FTS5 interprets "word:" as a column filter,
      // causing a 500 when "word" isn't a real column name.
      textParts.push(token.replace(/:$/, ''))
    }
  }

  filters.text = textParts.join(' ')
  return filters
}

// Renders a filter object back into the canonical query string - the search
// box always shows the REAL active query, never a blank box hiding a rule.
// Uses short-form status tokens (inbox: not status:inbox). Round-trips
// with parseSearchQuery.
export function stringifySearchFilters (filters) {
  const parts = []
  if (filters.all) parts.push('all:')
  if (filters.sent) parts.push('sent:')
  if (filters.status) parts.push(`${filters.status}:`)
  for (const tag of filters.tags) parts.push(tag.includes(' ') ? `tag:"${tag}"` : `tag:${tag}`)
  if (filters.starred) parts.push('starred:')
  if (filters.text) parts.push(filters.text)
  return parts.join(' ')
}

const VALID_STATUSES = new Set(['inbox', 'archive', 'spam', 'trash'])

// Resolves the actual query to run: defaults an empty/unfiltered query to
// Inbox, and guards against a garbage status: value falling through to SQL.
export function resolveEffectiveQuery (rawQuery) {
  const filters = parseSearchQuery(rawQuery)

  const hasAnyFilter = filters.all || filters.sent || filters.status || filters.tags.length > 0 || filters.starred || filters.text
  if (!hasAnyFilter) {
    filters.status = 'inbox'
  }

  if (filters.status && !VALID_STATUSES.has(filters.status)) {
    filters.status = 'inbox'
  }

  return filters
}

// Splits a comma-separated tags column value into a clean array.
export function parseTags (tagsString) {
  return (tagsString || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

export function formatTags (tags) {
  return tags.map((t) => t.trim()).filter(Boolean).join(',')
}

// Counts tag frequency across a list of raw tags-column values (one per
// email) and returns the top N as [{ tag, count }], most-used first.
export function topTags (allTagsStrings, limit = 5) {
  const counts = new Map()
  for (const tagsString of allTagsStrings) {
    for (const tag of parseTags(tagsString)) {
      counts.set(tag, (counts.get(tag) || 0) + 1)
    }
  }
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}
