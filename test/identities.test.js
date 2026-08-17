import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseIdentities, formatIdentities, getDefaultIdentity, findIdentityByAddress } from '../src/identities.js'

test('parseIdentities: parses address,name,avatarUrl per line', () => {
  const result = parseIdentities('brine@casadeocio.org,Brine,https://x.com/a.jpg')
  assert.deepEqual(result, [{ address: 'brine@casadeocio.org', name: 'Brine', avatarUrl: 'https://x.com/a.jpg' }])
})

test('parseIdentities: name and avatarUrl are optional', () => {
  const result = parseIdentities('ping@domain.com')
  assert.deepEqual(result, [{ address: 'ping@domain.com', name: '', avatarUrl: '' }])
})

test('parseIdentities: multiple lines, order preserved (top = default)', () => {
  const result = parseIdentities('a@x.com,A\nb@x.com,B')
  assert.equal(result[0].address, 'a@x.com')
  assert.equal(result[1].address, 'b@x.com')
})

test('parseIdentities: blank lines are ignored', () => {
  const result = parseIdentities('a@x.com,A\n\n\nb@x.com,B\n')
  assert.equal(result.length, 2)
})

test('parseIdentities: whitespace around fields is trimmed', () => {
  const result = parseIdentities('  a@x.com , A Name , https://x.com/a.jpg  ')
  assert.deepEqual(result[0], { address: 'a@x.com', name: 'A Name', avatarUrl: 'https://x.com/a.jpg' })
})

test('parseIdentities: a line with no address is dropped entirely', () => {
  const result = parseIdentities(',No Address\na@x.com,Has Address')
  assert.equal(result.length, 1)
  assert.equal(result[0].address, 'a@x.com')
})

test('parseIdentities: empty input returns empty array', () => {
  assert.deepEqual(parseIdentities(''), [])
  assert.deepEqual(parseIdentities(null), [])
})

test('parseIdentities: a name containing a comma does not corrupt the avatar URL', () => {
  // Real bug, found via external review: naive split(',') with positional
  // destructuring silently put "Jr." into avatarUrl instead of the URL.
  // A comma in a name shows up as a suffix ("John Smith, Jr."), not
  // inverted Last, First order - nobody actually types their own name
  // that way.
  const result = parseIdentities('intern@foo.com,John Smith, Jr.,https://gravatar.com/x.jpg')
  assert.deepEqual(result[0], {
    address: 'intern@foo.com',
    name: 'John Smith, Jr.',
    avatarUrl: 'https://gravatar.com/x.jpg'
  })
})

test('parseIdentities: address only, no commas at all', () => {
  const result = parseIdentities('solo@x.com')
  assert.deepEqual(result[0], { address: 'solo@x.com', name: '', avatarUrl: '' })
})

test('parseIdentities: address and name, no avatar URL', () => {
  const result = parseIdentities('a@x.com,A Name')
  assert.deepEqual(result[0], { address: 'a@x.com', name: 'A Name', avatarUrl: '' })
})

test('formatIdentities: address-only produces no trailing commas', () => {
  const result = formatIdentities([{ address: 'ping@x.com', name: '', avatarUrl: '' }])
  assert.equal(result, 'ping@x.com')
})

test('formatIdentities: address+name produces no trailing comma', () => {
  const result = formatIdentities([{ address: 'ping@x.com', name: 'Ping', avatarUrl: '' }])
  assert.equal(result, 'ping@x.com,Ping')
})

test('formatIdentities: empty name with avatar URL preserves empty middle field', () => {
  const result = formatIdentities([{ address: 'ping@x.com', name: '', avatarUrl: 'https://x.com/a.jpg' }])
  assert.equal(result, 'ping@x.com,,https://x.com/a.jpg')
})

test('formatIdentities/parseIdentities: round-trip', () => {
  const original = [
    { address: 'a@x.com', name: 'A', avatarUrl: 'https://x.com/a.jpg' },
    { address: 'intern@x.com', name: 'The Intern', avatarUrl: '' }
  ]
  const roundTripped = parseIdentities(formatIdentities(original))
  assert.deepEqual(roundTripped, original)
})

test('getDefaultIdentity: returns the first identity', () => {
  const identities = parseIdentities('a@x.com,A\nb@x.com,B')
  assert.equal(getDefaultIdentity(identities).address, 'a@x.com')
})

test('getDefaultIdentity: null for an empty list', () => {
  assert.equal(getDefaultIdentity([]), null)
})

test('findIdentityByAddress: finds a match', () => {
  const identities = parseIdentities('a@x.com,A\nintern@x.com,The Intern')
  const found = findIdentityByAddress(identities, 'intern@x.com')
  assert.equal(found.name, 'The Intern')
})

test('findIdentityByAddress: case-insensitive', () => {
  const identities = parseIdentities('Brine@X.com,Brine')
  const found = findIdentityByAddress(identities, 'brine@x.com')
  assert.equal(found.name, 'Brine')
})

test('findIdentityByAddress: null when no match - reply must still work with the raw address', () => {
  const identities = parseIdentities('a@x.com,A')
  assert.equal(findIdentityByAddress(identities, 'stray-alias@x.com'), null)
})
