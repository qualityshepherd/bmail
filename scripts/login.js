// Performs a real login against a running Bmail worker by deriving the
// Ed25519 keypair from a passphrase at request time - same algorithm as
// the browser setup page (src/lib/setup-page.js). Nothing is ever read
// from or written to disk; the same passphrase + this worker's hostname
// always reproduces the same key.
//
// Usage:
//   node scripts/login.js <baseUrl> <passphrase>
//
// Example:
//   node scripts/login.js http://localhost:8787 "yeah well that's just like your opinion man"
//
// Note: hostname is part of the derivation salt, so a passphrase used
// against localhost:8787 during local dev derives a DIFFERENT key than
// the same passphrase against your real deployed domain - that's
// intentional (origin-scoped, like WebAuthn), not a bug. You'll need
// AUTH_PUBKEY set separately for local vs. remote if you want to log in
// to both with the same passphrase.

const [, , baseUrl, passphrase] = process.argv

if (!baseUrl || !passphrase) {
  console.error('Usage: node scripts/login.js <baseUrl> <passphrase>')
  process.exit(1)
}

const PKCS8_HEADER = new Uint8Array([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06,
  0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20
])

function bytesToHex (bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function base64UrlToBytes (b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64url.length / 4) * 4, '=')
  return new Uint8Array(Buffer.from(b64, 'base64'))
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

  const privateKey = await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, true, ['sign'])
  const jwk = await crypto.subtle.exportKey('jwk', privateKey)
  const pubKeyHex = bytesToHex(base64UrlToBytes(jwk.x))

  return { privateKey, pubKeyHex }
}

async function main () {
  const hostname = new URL(baseUrl).hostname
  const { privateKey, pubKeyHex } = await deriveKeyPair(passphrase, hostname)

  const challengeRes = await fetch(`${baseUrl}/api/challenge`)
  if (!challengeRes.ok) throw new Error(`challenge request failed: ${challengeRes.status}`)
  const { challenge, configured } = await challengeRes.json()
  if (!configured) {
    console.error(`AUTH_PUBKEY isn't set yet - visit ${baseUrl} in a browser to run setup first.`)
    process.exit(1)
  }

  const signature = new Uint8Array(
    await crypto.subtle.sign('Ed25519', privateKey, new TextEncoder().encode(challenge))
  )
  const sigHex = bytesToHex(signature)

  const loginRes = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pubkey: pubKeyHex, challenge, sig: sigHex })
  })

  const body = await loginRes.json()
  if (!loginRes.ok) {
    console.error('Login failed:', loginRes.status, body)
    console.error('Derived pubkey:', pubKeyHex, '- does this match AUTH_PUBKEY?')
    process.exit(1)
  }

  console.log('Login succeeded.')
  console.log('Set-Cookie:', loginRes.headers.get('set-cookie'))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
