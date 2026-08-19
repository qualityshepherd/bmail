import { anyPatternMatches } from './match.js'

// Pure decision function: given the allowlisted sender/alias patterns and
// the actual sender/recipient of an incoming email, should notify be set?
// Per spec: notify is active ONLY on an explicit allowlist match; every
// other alias is silent by default.
export function shouldNotify ({ senderPatterns, aliasPatterns, sender, recipient }) {
  return anyPatternMatches(senderPatterns, sender) || anyPatternMatches(aliasPatterns, recipient)
}

export function buildSmsPayload ({ unreadCount, senders = [] }) {
  const count = unreadCount === 1 ? '1 unread' : `${unreadCount} unread`
  const header = `Bmail: ${count}`
  if (senders.length === 0) return header
  const names = senders.map((s) => s.sender_display || s.sender)
  const body = header + '\n' + names.join('\n')
  return body.length <= 159 ? body : body.slice(0, 158) + '…'
}
