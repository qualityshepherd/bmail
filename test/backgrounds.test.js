import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseBackgrounds, pickBackground, findInvalidBackground } from '../src/backgrounds.js'

const DAY = 86400000

test('parseBackgrounds: blank setting is empty, not a crash', () => {
  for (const raw of ['', '   ', '\n\n', null, undefined]) {
    assert.deepEqual(parseBackgrounds(raw), { all: [], pool: [] })
  }
})

test('parseBackgrounds: no stars means everything is in the rotation', () => {
  const { all, pool } = parseBackgrounds('https://a.jpg\nhttps://b.jpg\nhttps://c.jpg')
  assert.deepEqual(all, ['https://a.jpg', 'https://b.jpg', 'https://c.jpg'])
  assert.deepEqual(pool, all)
})

test('parseBackgrounds: one star pins, and stays listed', () => {
  const { all, pool } = parseBackgrounds('https://a.jpg\n*https://b.jpg\nhttps://c.jpg')
  assert.equal(all.length, 3)
  assert.deepEqual(pool, ['https://b.jpg'])
})

test('parseBackgrounds: several stars rotate among themselves', () => {
  const { pool } = parseBackgrounds('https://a.jpg\n*https://b.jpg\n*https://c.jpg')
  assert.deepEqual(pool, ['https://b.jpg', 'https://c.jpg'])
})

test('parseBackgrounds: whitespace and blank lines are forgiven', () => {
  const { all, pool } = parseBackgrounds('\n  https://a.jpg  \n\n *  https://b.jpg \n')
  assert.deepEqual(all, ['https://a.jpg', 'https://b.jpg'])
  assert.deepEqual(pool, ['https://b.jpg'])
})

test('parseBackgrounds: non-http lines are dropped, not rendered', () => {
  const { all } = parseBackgrounds('https://ok.jpg\njavascript:alert(1)\ndata:image/png;base64,AA\nnot a url')
  assert.deepEqual(all, ['https://ok.jpg'])
})

test('pickBackground: a single url is always that url', () => {
  for (let d = 0; d < 10; d++) {
    assert.equal(pickBackground('https://only.jpg', d * DAY), 'https://only.jpg')
  }
})

test('pickBackground: a pinned url never rotates away', () => {
  const raw = 'https://a.jpg\n*https://b.jpg\nhttps://c.jpg'
  for (let d = 0; d < 20; d++) {
    assert.equal(pickBackground(raw, d * DAY), 'https://b.jpg')
  }
})

test('pickBackground: stable all day, different tomorrow', () => {
  const raw = 'https://a.jpg\nhttps://b.jpg\nhttps://c.jpg'
  const start = 19000 * DAY
  const morning = pickBackground(raw, start)
  assert.equal(pickBackground(raw, start + (DAY - 1)), morning, 'changed mid-day')
  assert.notEqual(pickBackground(raw, start + DAY), morning, 'same two days running')
})

test('pickBackground: round-robin gives every image its turn before repeating', () => {
  const raw = 'https://a.jpg\nhttps://b.jpg\nhttps://c.jpg\nhttps://d.jpg'
  const seen = [0, 1, 2, 3].map((d) => pickBackground(raw, (19000 + d) * DAY))
  assert.equal(new Set(seen).size, 4)
  // and it wraps
  assert.equal(pickBackground(raw, 19004 * DAY), seen[0])
})

test('pickBackground: nothing set renders no background', () => {
  assert.equal(pickBackground(''), '')
  assert.equal(pickBackground('not a url'), '')
  assert.equal(pickBackground(null), '')
})

test('pickBackground: an existing single-url setting keeps working untouched', () => {
  // what every install already has stored, pre-textarea
  assert.equal(pickBackground('https://example.com/wallpaper.jpg'), 'https://example.com/wallpaper.jpg')
})

test('findInvalidBackground: names the bad line so it is not silently dropped', () => {
  assert.equal(findInvalidBackground('https://a.jpg\nexample.com/b.jpg'), 'example.com/b.jpg')
  assert.equal(findInvalidBackground('https://a.jpg\n*https://b.jpg'), null)
  assert.equal(findInvalidBackground(''), null)
  assert.equal(findInvalidBackground('\n  \n'), null)
  assert.equal(findInvalidBackground('*nope'), '*nope')
})
