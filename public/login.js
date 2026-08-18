const SCORE_COLORS = ['#c06060', '#b08040', '#b08040', '#6a9a6a', '#6a9a6a']
const SCORE_FLAVORS = [
  'your dog could guess this',
  'a bored 12-year-old could crack this',
  'mediocre. try a movie quote',
  'not bad. a determined nerd might get there',
  'heat death of the universe. nice.'
]

function scorePassphrase (phrase) {
  const len = phrase.length
  const words = phrase.trim().split(/\s+/).length
  const hasUpper = /[A-Z]/.test(phrase)
  const hasNum = /[0-9]/.test(phrase)
  const hasSymbol = /[^a-zA-Z0-9\s]/.test(phrase)
  let score = 0
  if (len >= 12) score++
  if (len >= 20) score++
  if (words >= 4) score++
  if (hasUpper || hasNum || hasSymbol) score++
  return Math.min(score, 4)
}

const EYE_OPEN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>'
const EYE_CLOSED = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"></path><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>'

document.getElementById('passphrase').addEventListener('input', (e) => {
  const val = e.target.value
  const bar = document.getElementById('strength-bar')
  const flavor = document.getElementById('strength-flavor')
  if (!val) {
    bar.style.width = '0%'
    flavor.textContent = ''
    return
  }
  const score = scorePassphrase(val)
  bar.style.width = `${(score + 1) * 20}%`
  bar.style.background = SCORE_COLORS[score]
  flavor.textContent = SCORE_FLAVORS[score]
})

document.getElementById('toggle-passphrase').addEventListener('click', () => {
  const input = document.getElementById('passphrase')
  const btn = document.getElementById('toggle-passphrase')
  const showing = input.type === 'text'
  input.type = showing ? 'password' : 'text'
  btn.innerHTML = showing ? EYE_OPEN : EYE_CLOSED
  btn.setAttribute('aria-label', showing ? 'Show passphrase' : 'Hide passphrase')
})

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const passphrase = document.getElementById('passphrase').value.trim()
  if (!passphrase) return

  const btn = document.getElementById('login-btn')
  const status = document.getElementById('status')
  btn.disabled = true
  btn.textContent = 'logging in...'
  status.textContent = ''

  try {
    const challengeRes = await fetch('/api/challenge')
    const { challenge, configured } = await challengeRes.json()
    if (!configured) {
      window.location.href = '/setup'
      return
    }

    const { pubKeyHex, sigHex, error } = await new Promise((resolve) => {
      const worker = new Worker('/crypto-worker.js')
      worker.onmessage = (e) => { worker.terminate(); resolve(e.data) }
      worker.postMessage({ passphrase, hostname: window.location.hostname, challenge })
    })

    if (error) throw new Error(error)

    const loginRes = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pubkey: pubKeyHex, challenge, sig: sigHex })
    })

    if (loginRes.ok) {
      window.location.href = '/inbox'
      return
    }

    const body = await loginRes.json().catch(() => ({}))
    status.textContent = loginRes.status === 429
      ? 'Too many attempts - wait a bit and try again.'
      : (body.error || 'Login failed - check your passphrase.')
  } catch (err) {
    console.error('login failed:', err)
    status.textContent = 'Something went wrong - check console.'
  }

  btn.disabled = false
  btn.textContent = 'Log in'
})
