export function autoWildcard (patterns) {
  const byDomain = patterns.reduce((acc, p) => {
    const at = p.lastIndexOf('@')
    if (at === -1) return acc
    const domain = p.slice(at + 1)
    return { ...acc, [domain]: [...(acc[domain] || []), p] }
  }, {})

  const candidates = patterns.map((p) => {
    const at = p.lastIndexOf('@')
    if (at === -1) return p
    const domain = p.slice(at + 1)
    const group = byDomain[domain]
    return (!group.some((g) => g.includes('*')) && group.length >= 2) ? `*@${domain}` : p
  })

  return [...new Set(candidates)]
}
