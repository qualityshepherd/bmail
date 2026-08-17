// Pure functions for matching email addresses against stored patterns.
// Patterns support a leading '*' for domain-wide wildcards, e.g. '*@spam.com'.
// Matching is case-insensitive.

export function normalizeAddress (address) {
  return (address || '').trim().toLowerCase()
}

export function patternMatches (pattern, address) {
  const normalizedPattern = normalizeAddress(pattern)
  const normalizedAddress = normalizeAddress(address)

  if (normalizedPattern.startsWith('*@')) {
    const domain = normalizedPattern.slice(1) // keep the leading '@'
    return normalizedAddress.endsWith(domain)
  }

  return normalizedPattern === normalizedAddress
}

export function anyPatternMatches (patterns, address) {
  return patterns.some((pattern) => patternMatches(pattern, address))
}
