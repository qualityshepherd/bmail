// Derives an Ed25519 keypair from a passphrase + this page's own hostname,
// via PBKDF2 -> raw seed -> PKCS8-wrapped Ed25519 import. Deterministic:
// the same passphrase on the same domain always reproduces the same key,
// so there is nothing to save or lose - only something to remember.
// Salting with the hostname (not a fixed string) means the same passphrase
// produces a DIFFERENT key on a different domain, the same way WebAuthn
// scopes credentials to an origin - so a passphrase leaking or being reused
// elsewhere doesn't hand over this specific deployment's key.

const PKCS8_HEADER = new Uint8Array([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06,
  0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20
])

function bytesToHex (bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

function base64UrlToBytes (b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64url.length / 4) * 4, '=')
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function deriveKeyPair (passphrase, hostname) {
  const enc = new TextEncoder()

  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveBits']
  )

  const seed = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(hostname), iterations: 600000 },
    keyMaterial, 256
  )

  const pkcs8 = new Uint8Array(PKCS8_HEADER.length + 32)
  pkcs8.set(PKCS8_HEADER)
  pkcs8.set(new Uint8Array(seed), PKCS8_HEADER.length)

  const privateKey = await crypto.subtle.importKey(
    'pkcs8', pkcs8, { name: 'Ed25519' }, true, ['sign']
  )

  const jwk = await crypto.subtle.exportKey('jwk', privateKey)
  const pubKeyHex = bytesToHex(base64UrlToBytes(jwk.x))

  return { privateKey, pubKeyHex }
}

document.getElementById('hostname').textContent = window.location.hostname

document.getElementById('generate').addEventListener('click', async () => {
  const passphrase = document.getElementById('passphrase').value.trim()
  if (!passphrase) return document.getElementById('passphrase').focus()

  const btn = document.getElementById('generate')
  btn.disabled = true
  btn.textContent = 'deriving...'

  try {
    const { pubKeyHex } = await deriveKeyPair(passphrase, window.location.hostname)
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
