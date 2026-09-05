import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseHttpUrl, chooseUnsubscribeMethod } from '../src/unsubscribe-handler.js'

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
