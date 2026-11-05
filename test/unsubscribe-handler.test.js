import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseHttpUrl, parseMailto, chooseUnsubscribeMethod, isFetchableUnsubscribeUrl } from '../src/unsubscribe-handler.js'

// parseHttpUrl
test('parseHttpUrl: extracts an https URL', () => {
  assert.equal(parseHttpUrl('<https://example.com/unsub>'), 'https://example.com/unsub')
})

test('parseHttpUrl: ignores a mailto entry', () => {
  assert.equal(parseHttpUrl('<mailto:unsub@example.com>'), null)
})

test('parseHttpUrl: picks the http(s) entry out of a mixed list', () => {
  assert.equal(
    parseHttpUrl('<mailto:unsub@example.com>, <https://example.com/unsub>'),
    'https://example.com/unsub'
  )
})

test('parseHttpUrl: empty header returns null', () => {
  assert.equal(parseHttpUrl(''), null)
})

test('parseHttpUrl: a bare URL with no angle brackets is ignored', () => {
  assert.equal(parseHttpUrl('https://example.com/unsub'), null)
})

// isFetchableUnsubscribeUrl
test('isFetchableUnsubscribeUrl: allows an ordinary https URL', () => {
  assert.equal(isFetchableUnsubscribeUrl('https://example.com/unsub'), true)
})

test('isFetchableUnsubscribeUrl: rejects non-http(s) protocols', () => {
  assert.equal(isFetchableUnsubscribeUrl('file:///etc/passwd'), false)
  assert.equal(isFetchableUnsubscribeUrl('ftp://example.com/unsub'), false)
})

test('isFetchableUnsubscribeUrl: rejects localhost', () => {
  assert.equal(isFetchableUnsubscribeUrl('http://localhost/unsub'), false)
})

test('isFetchableUnsubscribeUrl: rejects loopback and private IPv4 literals', () => {
  assert.equal(isFetchableUnsubscribeUrl('http://127.0.0.1/unsub'), false)
  assert.equal(isFetchableUnsubscribeUrl('http://10.0.0.5/unsub'), false)
  assert.equal(isFetchableUnsubscribeUrl('http://192.168.1.1/unsub'), false)
  assert.equal(isFetchableUnsubscribeUrl('http://172.16.0.1/unsub'), false)
})

test('isFetchableUnsubscribeUrl: rejects the cloud metadata address', () => {
  assert.equal(isFetchableUnsubscribeUrl('http://169.254.169.254/latest/meta-data'), false)
})

test('isFetchableUnsubscribeUrl: rejects IPv6 literals, including loopback and private ranges', () => {
  assert.equal(isFetchableUnsubscribeUrl('http://[::1]/unsub'), false)
  assert.equal(isFetchableUnsubscribeUrl('http://[fd00::1]/unsub'), false)
  assert.equal(isFetchableUnsubscribeUrl('http://[fe80::1]/unsub'), false)
  assert.equal(isFetchableUnsubscribeUrl('https://[2001:4860:4860::8888]/unsub'), false)
})

test('isFetchableUnsubscribeUrl: rejects an invalid URL', () => {
  assert.equal(isFetchableUnsubscribeUrl('not a url'), false)
})

// chooseUnsubscribeMethod
test('chooseUnsubscribeMethod: one-click when List-Unsubscribe-Post confirms it', () => {
  const email = {
    list_unsubscribe: '<https://example.com/unsub>',
    list_unsubscribe_post: 'List-Unsubscribe=One-Click'
  }
  assert.deepEqual(chooseUnsubscribeMethod(email), { method: 'one-click', target: 'https://example.com/unsub' })
})

test('chooseUnsubscribeMethod: header comparison is case/whitespace insensitive', () => {
  const email = {
    list_unsubscribe: '<https://example.com/unsub>',
    list_unsubscribe_post: '  list-unsubscribe=one-click  '
  }
  assert.equal(chooseUnsubscribeMethod(email).method, 'one-click')
})

test('chooseUnsubscribeMethod: falls back to mailto when one-click is not confirmed', () => {
  const email = {
    list_unsubscribe: '<mailto:plura-list-request@pluralistic.net?subject=unsubscribe>, <https://mail.flarn.com/mailman/options/plura-list/cd%40casadeocio.org>',
    list_unsubscribe_post: null
  }
  assert.deepEqual(chooseUnsubscribeMethod(email), {
    method: 'mailto',
    target: 'mailto:plura-list-request@pluralistic.net?subject=unsubscribe'
  })
})

test('chooseUnsubscribeMethod: manual hand-off when only a non-one-click HTTP link exists', () => {
  const email = {
    list_unsubscribe: '<https://mail.flarn.com/mailman/options/plura-list/cd%40casadeocio.org>',
    list_unsubscribe_post: null
  }
  assert.deepEqual(chooseUnsubscribeMethod(email), {
    method: 'manual',
    target: 'https://mail.flarn.com/mailman/options/plura-list/cd%40casadeocio.org'
  })
})

test('chooseUnsubscribeMethod: an HTTP link with an unrelated List-Unsubscribe-Post value is not one-click', () => {
  const email = {
    list_unsubscribe: '<https://example.com/unsub>',
    list_unsubscribe_post: 'something-else'
  }
  assert.equal(chooseUnsubscribeMethod(email).method, 'manual')
})

test('chooseUnsubscribeMethod: none when there is nothing usable', () => {
  const email = { list_unsubscribe: '', list_unsubscribe_post: null }
  assert.deepEqual(chooseUnsubscribeMethod(email), { method: 'none', target: null })
})

// parseMailto
test('parseMailto: extracts address and subject', () => {
  assert.deepEqual(
    parseMailto('mailto:plura-list-request@pluralistic.net?subject=unsubscribe'),
    { to: 'plura-list-request@pluralistic.net', subject: 'unsubscribe' }
  )
})

test('parseMailto: defaults subject to "unsubscribe" when absent', () => {
  assert.deepEqual(parseMailto('mailto:unsub@example.com'), { to: 'unsub@example.com', subject: 'unsubscribe' })
})

test('parseMailto: decodes a URL-encoded subject', () => {
  assert.equal(parseMailto('mailto:unsub@example.com?subject=unsubscribe%20me').subject, 'unsubscribe me')
})
