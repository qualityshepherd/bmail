// Pure functions for matching email addresses against stored patterns.
// Patterns support a leading '*' for domain-wide wildcards, e.g. '*@spam.com'.
// Matching is case-insensitive.

export function normalizeAddress (address) {
  return (address || '').trim().toLowerCase()
}

function globMatches (pattern, text) {
  const re = new RegExp(
    pattern.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*'),
    'i'
  )
  return re.test(text)
}

export function patternMatches (pattern, address, fullFrom) {
  const normalizedPattern = normalizeAddress(pattern)
  const normalizedAddress = normalizeAddress(address)

  if (normalizedPattern.startsWith('*@')) {
    const domain = normalizedPattern.slice(1) // keep the leading '@'
    return normalizedAddress.endsWith(domain)
  }

  // Glob pattern (*pattern* or *pattern or pattern*): match against full From header
  if (normalizedPattern.includes('*')) {
    const target = fullFrom ? fullFrom.toLowerCase() : normalizedAddress
    return globMatches(normalizedPattern, target)
  }

  // Bare domain (no @): match the domain itself or any subdomain
  if (!normalizedPattern.includes('@')) {
    return normalizedAddress.endsWith('@' + normalizedPattern) ||
           normalizedAddress.endsWith('.' + normalizedPattern)
  }

  return normalizedPattern === normalizedAddress
}

export function anyPatternMatches (patterns, address, fullFrom) {
  return patterns.some((pattern) => patternMatches(pattern, address, fullFrom))
}
