document.getElementById('hostname').textContent = window.location.hostname

document.getElementById('generate').addEventListener('click', async () => {
  const passphrase = document.getElementById('passphrase').value.trim()
  if (!passphrase) return document.getElementById('passphrase').focus()

  const btn = document.getElementById('generate')
  btn.disabled = true
  btn.textContent = 'deriving...'

  try {
    const { pubKeyHex, error } = await new Promise((resolve) => {
      const worker = new Worker('/crypto-worker.js')
      worker.onmessage = (e) => { worker.terminate(); resolve(e.data) }
      worker.postMessage({ passphrase, hostname: window.location.hostname })
    })

    if (error) throw new Error(error)

    document.getElementById('varsBlock').textContent = 'AUTH_PUBKEY = "' + pubKeyHex + '"'
    document.getElementById('output').classList.add('visible')
    btn.textContent = 'regenerate'
  } catch (err) {
    console.error('keygen failed:', err)
    btn.textContent = 'error - check console'
  }

  btn.disabled = false
})

document.getElementById('passphrase').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('generate').click()
})
