export const SMS_NOTIFICATION_MAX_PER_WINDOW = 6
export const SMS_NOTIFICATION_WINDOW_MS = 60 * 60 * 1000

// 'send' | 'warn' | 'suppress' from the post-increment count returned by
// incrementSmsNotificationCount. The warning fires exactly once - on the
// specific call that first exceeds the cap - since every call after that
// returns a strictly larger count and falls into 'suppress' instead.
export function classifySmsNotification (count) {
  if (count <= SMS_NOTIFICATION_MAX_PER_WINDOW) return 'send'
  if (count === SMS_NOTIFICATION_MAX_PER_WINDOW + 1) return 'warn'
  return 'suppress'
}

const MAX_SMS_FIELD_LENGTH = 60

// Strips URLs, folds to plain ASCII, and trims to a short length - the
// same lesson as the original hourly digest: arbitrary inbound content
// (sender name, subject line) reaching the SMS gateway verbatim is what
// got it flagged as spam once already. ASCII-folding isn't about spam
// filtering specifically - it's so a stray accented character or emoji in
// a sender name can't silently flip the whole message from GSM-7 to UCS-2
// encoding, which halves the per-segment length (160 -> 70) and could
// split one short text into two.
const sanitizeSmsField = (value) =>
  (value || '')
    .replace(/https?:\/\/\S+/gi, '')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SMS_FIELD_LENGTH)

export function buildNewMailSmsPayload ({ sender, subject }) {
  const from = sanitizeSmsField(sender) || 'unknown sender'
  const subj = sanitizeSmsField(subject) || '(no subject)'
  return `Bmail: ${from} - ${subj}`
}

export function buildSmsPauseWarning () {
  return `Bmail: high volume of new mail - pausing notifications for ${SMS_NOTIFICATION_WINDOW_MS / 60000} min`
}
