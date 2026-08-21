export function buildSmsPayload ({ unreadCount }) {
  const noun = unreadCount === 1 ? 'email' : 'emails'
  return `Bmail: you have ${unreadCount} unread ${noun}`
}
