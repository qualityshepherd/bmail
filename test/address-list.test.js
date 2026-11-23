import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseAddressList, looksLikeAddress } from '../src/html.js'
import { peopleFromSend } from '../src/contacts.js'

test('parseAddressList: plain lists still split on commas', () => {
  assert.deepEqual(parseAddressList('a@x.org, B <b@y.org>,c@z.org,'), ['a@x.org', 'B <b@y.org>', 'c@z.org'])
  assert.deepEqual(parseAddressList(''), [])
  assert.deepEqual(parseAddressList(null), [])
})

test('parseAddressList: a quoted name keeps its comma', () => {
  assert.deepEqual(parseAddressList('"Moreale, Manuel" <m@x.org>, a@x.org'), ['"Moreale, Manuel" <m@x.org>', 'a@x.org'])
})

test('parseAddressList: an unquoted comma name glues back and comes out quoted', () => {
  assert.deepEqual(parseAddressList('Moreale, Manuel <m@x.org>, a@x.org'), ['"Moreale, Manuel" <m@x.org>', 'a@x.org'])
  assert.deepEqual(parseAddressList('Trout, Kilgore, Esq. <k@t.fish>'), ['"Trout, Kilgore, Esq." <k@t.fish>'])
})

test('parseAddressList: a stray word before a bare address is not guessed at', () => {
  const list = parseAddressList('oops, a@x.org')
  assert.deepEqual(list, ['oops', 'a@x.org'])
  assert.ok(!looksLikeAddress(list[0]))
})

test('parseAddressList: the glued name reaches contacts intact', () => {
  const [p] = peopleFromSend({ to: parseAddressList('Moreale, Manuel <M@x.org>') })
  assert.deepEqual(p, { email: 'm@x.org', name: 'Moreale, Manuel', typed: true })
})
