import { esc } from './attachments.js'

// Shared by compose.js (to/cc/bcc) and message.js (reply-to/reply-cc/reply-bcc) -
// both forms feed it the same #addr-datalist. Returns an attach(inputId)
// function bound to this page's contact list.
export function createAddressAutocomplete (allContacts) {
  function lastToken (val) {
    const comma = val.lastIndexOf(',')
    return comma === -1 ? val.trimStart() : val.slice(comma + 1).trimStart()
  }

  function replaceLastToken (val, replacement) {
    const comma = val.lastIndexOf(',')
    return (comma === -1 ? '' : val.slice(0, comma + 1) + ' ') + replacement
  }

  function matchContacts (token) {
    if (!token) return []
    const lower = token.toLowerCase()
    return allContacts.filter((c) => c.toLowerCase().includes(lower)).slice(0, 6)
  }

  return function attachAutocomplete (inputId) {
    const input = document.getElementById(inputId)
    if (!input || !allContacts.length) return

    const hadFocus = document.activeElement === input

    const wrap = document.createElement('div')
    wrap.className = 'addr-field-wrap'
    input.parentNode.insertBefore(wrap, input)
    wrap.appendChild(input)

    // Moving a focused node to a new parent blurs it - restore focus so
    // autofocus (e.g. the "to" field on compose) survives this rewiring.
    if (hadFocus) input.focus()

    const dropdown = document.createElement('ul')
    dropdown.className = 'addr-dropdown'
    wrap.appendChild(dropdown)

    let activeIdx = -1
    let matches = []

    function hide () {
      dropdown.classList.remove('open')
      activeIdx = -1
      matches = []
    }

    function render () {
      dropdown.innerHTML = matches.map((m, i) =>
        `<li data-idx="${i}"${i === activeIdx ? ' class="active"' : ''}>${esc(m)}</li>`
      ).join('')
      dropdown.classList.toggle('open', matches.length > 0)
    }

    function select (m) {
      input.value = replaceLastToken(input.value, m) + ', '
      hide()
      input.dispatchEvent(new Event('input'))
    }

    input.addEventListener('input', () => {
      matches = matchContacts(lastToken(input.value))
      activeIdx = -1
      render()
    })

    input.addEventListener('keydown', (e) => {
      if (!dropdown.classList.contains('open')) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        activeIdx = Math.min(activeIdx + 1, matches.length - 1)
        render()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        activeIdx = Math.max(activeIdx - 1, -1)
        render()
      } else if (e.key === 'Tab' || e.key === 'Enter') {
        const pick = activeIdx >= 0 ? matches[activeIdx] : matches[0]
        if (pick) { e.preventDefault(); select(pick) }
      } else if (e.key === 'Escape') {
        hide()
      }
    })

    dropdown.addEventListener('mousedown', (e) => {
      const li = e.target.closest('li[data-idx]')
      if (li) { e.preventDefault(); select(matches[Number(li.dataset.idx)]) }
    })

    input.addEventListener('blur', () => setTimeout(hide, 150))
  }
}
