import { anyPatternMatches } from './match.js'

// Pure decision function: given the allowlisted sender/alias patterns and
// the actual sender/recipient of an incoming email, should notify be set?
// Per spec: notify is active ONLY on an explicit allowlist match; every
// other alias is silent by default.
export function shouldNotify ({ senderPatterns, aliasPatterns, sender, recipient }) {
  return anyPatternMatches(senderPatterns, sender) || anyPatternMatches(aliasPatterns, recipient)
}

export function buildSmsPayload ({ unreadCount, url }) {
  const noun = unreadCount === 1 ? 'email' : 'emails'
  return `Bmail: you have ${unreadCount} unread ${noun}\n${url}`
}
