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
