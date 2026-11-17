import { test } from 'node:test'
import assert from 'node:assert/strict'
import { avatarSwatch, AVATAR_SWATCHES } from '../src/html.js'

const bgOf = (style) => style.match(/--av-bg:(#[0-9a-f]{6})/)[1]

test('avatarSwatch: same address, same colours', () => {
  assert.equal(avatarSwatch('jane@example.com'), avatarSwatch('jane@example.com'))
})

test('avatarSwatch: emits both custom properties from the palette', () => {
  const style = avatarSwatch('jane@example.com')
  assert.match(style, /^--av-bg:#[0-9a-f]{6};--av-fg:#[0-9a-f]{6}$/)
  const [bg, fg] = AVATAR_SWATCHES.find(([b]) => b === bgOf(style))
  assert.ok(style.includes(bg) && style.includes(fg))
})

// The bug this replaced: the inbox hashed the raw sender while the sent
// list hashed the lowercased bare address, so one person wore two colours.
test('avatarSwatch: case and display-name wrapping do not change the colour', () => {
  const want = avatarSwatch('jane@example.com')
  assert.equal(avatarSwatch('Jane@Example.COM'), want)
  assert.equal(avatarSwatch('Jane Smith <jane@example.com>'), want)
  assert.equal(avatarSwatch('"Smith, Jane" <JANE@example.com>'), want)
  assert.equal(avatarSwatch('  jane@example.com  '), want)
})

test('avatarSwatch: survives junk without throwing', () => {
  for (const input of ['', null, undefined, '   ', 'not an address']) {
    assert.match(avatarSwatch(input), /^--av-bg:#[0-9a-f]{6};--av-fg:#[0-9a-f]{6}$/)
  }
})

test('avatarSwatch: spreads across every swatch, none starved', () => {
  const names = ['john', 'jane', 'mike', 'sarah', 'dave', 'alex', 'chris', 'emma',
    'ryan', 'lisa', 'tom', 'anna', 'ben', 'kate', 'sam', 'nina', 'paul', 'zoe']
  const domains = ['gmail.com', 'proton.me', 'outlook.com', 'icloud.com',
    'fastmail.com', 'hey.com', 'yahoo.com', 'brine.dev']

  const counts = new Map(AVATAR_SWATCHES.map(([bg]) => [bg, 0]))
  for (const n of names) {
    for (const d of domains) {
      const bg = bgOf(avatarSwatch(`${n}@${d}`))
      counts.set(bg, counts.get(bg) + 1)
    }
  }

  const total = names.length * domains.length
  assert.equal([...counts.values()].reduce((a, b) => a + b, 0), total)
  // every swatch used, and none hogging more than double its fair share
  for (const [bg, n] of counts) {
    assert.ok(n > 0, `swatch ${bg} never used`)
    assert.ok(n < (total / AVATAR_SWATCHES.length) * 2, `swatch ${bg} over-represented: ${n}/${total}`)
  }
})

test('AVATAR_SWATCHES: all entries are well-formed hex pairs', () => {
  assert.ok(AVATAR_SWATCHES.length >= 6)
  for (const entry of AVATAR_SWATCHES) {
    assert.equal(entry.length, 2)
    for (const c of entry) assert.match(c, /^#[0-9a-f]{6}$/)
  }
})
