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

// Strips URLs (got the gateway flagged as spam once already) and folds to
// ASCII so a stray emoji can't flip the encoding to UCS-2 and double the
// segment count.
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
