import { test } from 'node:test'
import assert from 'node:assert/strict'
import { autoWildcard } from '../src/filters.js'

test('autoWildcard: single address per domain passes through unchanged', () => {
  assert.deepEqual(autoWildcard(['a@foo.com']), ['a@foo.com'])
})

test('autoWildcard: two addresses on same domain collapse to wildcard', () => {
  assert.deepEqual(autoWildcard(['a@foo.com', 'b@foo.com']), ['*@foo.com'])
})

test('autoWildcard: three addresses on same domain collapse to one wildcard', () => {
  assert.deepEqual(autoWildcard(['a@foo.com', 'b@foo.com', 'c@foo.com']), ['*@foo.com'])
})

test('autoWildcard: domain already has a wildcard — individual addresses kept, no double-wildcard', () => {
  assert.deepEqual(autoWildcard(['a@foo.com', '*@foo.com']), ['a@foo.com', '*@foo.com'])
})

test('autoWildcard: mixed domains — only multi-address domains collapse', () => {
  const result = autoWildcard(['a@foo.com', 'b@foo.com', 'c@bar.com'])
  assert.deepEqual(result, ['*@foo.com', 'c@bar.com'])
})

test('autoWildcard: non-email patterns (no @) pass through unchanged', () => {
  assert.deepEqual(autoWildcard(['nodomain', 'another']), ['nodomain', 'another'])
})

test('autoWildcard: non-email patterns mixed with email patterns', () => {
  const result = autoWildcard(['nodomain', 'a@foo.com', 'b@foo.com'])
  assert.deepEqual(result, ['nodomain', '*@foo.com'])
})

test('autoWildcard: duplicate non-email patterns are deduplicated', () => {
  assert.deepEqual(autoWildcard(['nodomain', 'nodomain']), ['nodomain'])
})

test('autoWildcard: empty input returns empty array', () => {
  assert.deepEqual(autoWildcard([]), [])
})

test('autoWildcard: preserves first-seen order across domains', () => {
  const result = autoWildcard(['x@bar.com', 'a@foo.com', 'b@foo.com', 'y@bar.com'])
  assert.deepEqual(result, ['*@bar.com', '*@foo.com'])
})

test('autoWildcard: does not mutate the input array', () => {
  const input = ['a@foo.com', 'b@foo.com']
  const copy = [...input]
  autoWildcard(input)
  assert.deepEqual(input, copy)
})
