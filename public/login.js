const EYE_OPEN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>'
const EYE_CLOSED = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"></path><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>'

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
      status.textContent = 'No key configured yet - visit setup first.'
      btn.disabled = false
      btn.textContent = 'Log in'
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
