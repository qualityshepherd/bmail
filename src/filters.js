export function autoWildcard (patterns) {
  const byDomain = {}
  for (const p of patterns) {
    const at = p.lastIndexOf('@')
    if (at === -1) continue
    const domain = p.slice(at + 1)
    ;(byDomain[domain] = byDomain[domain] || []).push(p)
  }

  const seen = new Set()
  const result = []
  for (const p of patterns) {
    const at = p.lastIndexOf('@')
    if (at === -1) { if (!seen.has(p)) { seen.add(p); result.push(p) }; continue }
    const domain = p.slice(at + 1)
    const group = byDomain[domain]
    const hasWildcard = group.some((g) => g.includes('*'))
    if (!hasWildcard && group.length >= 2) {
      const wildcard = `*@${domain}`
      if (!seen.has(wildcard)) { seen.add(wildcard); result.push(wildcard) }
    } else {
      if (!seen.has(p)) { seen.add(p); result.push(p) }
    }
  }
  return result
}
