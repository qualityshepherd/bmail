// Tiny hand-rolled SVGs instead of an icon font/library - keeps the
// zero-runtime-dependency posture, and avoids emoji rendering
// inconsistently across OS/browser.
import { escapeHtml } from './html.js'

const ICONS = {
  inbox: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M22 12h-6l-2 3h-4l-2-3H2" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  archive: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M3 4h18v4H3V4zm1 5h16v11H4V9zm5 2v2h6v-2H9z" fill="currentColor"/></svg>',
  spam: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 2 1 21h22L12 2zm0 6v6m0 3h.01" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  starEmpty: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/></svg>',
  starFilled: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>'
}

export function renderStarIcon (emailId, starred, backUrl = '') {
  const icon = starred ? ICONS.starFilled : ICONS.starEmpty
  const label = starred ? 'Unstar' : 'Star'
  const backField = backUrl ? `<input type="hidden" name="back" value="${escapeHtml(backUrl)}">` : ''
  return `<form method="post" action="/message/${emailId}/star" class="status-icon-form">
    ${backField}<button type="submit" title="${label}" aria-label="${label}" class="${starred ? 'starred' : ''}">${icon}</button>
  </form>`
}

// Renders inbox/archive/spam/trash actions, hiding whichever matches currentStatus.
// backUrl is round-tripped so the action returns to the same filtered view.
// Already in trash, the trash icon has nothing left to mean as a move-to
// action, so it's repurposed as permanent delete instead of just hidden.
export function renderStatusIcons (emailId, currentStatus, backUrl) {
  const actions = ['inbox', 'archive', 'spam', 'trash'].filter((s) => s !== currentStatus)
  const moveIcons = actions.map((action) => {
    // Trash gets a clearer label than its terse siblings since it now sits
    // right next to the red permanent-delete version - worth disambiguating.
    const label = action === 'trash' ? 'Move to trash' : action
    return `
    <form method="post" action="/message/${emailId}/status" class="status-icon-form">
      <input type="hidden" name="status" value="${action}">
      <input type="hidden" name="back" value="${escapeHtml(backUrl)}">
      <button type="submit" title="${label}" aria-label="${label}">${ICONS[action]}</button>
    </form>`
  }).join('')

  const deleteForeverIcon = currentStatus === 'trash'
    ? `
    <form method="post" action="/message/${emailId}/delete" class="status-icon-form">
      <input type="hidden" name="back" value="${escapeHtml(backUrl)}">
      <button type="submit" title="Delete forever" aria-label="Delete forever" class="danger-icon">${ICONS.trash}</button>
    </form>`
    : ''

  return moveIcons + deleteForeverIcon
}
