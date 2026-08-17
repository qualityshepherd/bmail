import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseSearchQuery, stringifySearchFilters, resolveEffectiveQuery,
  parseTags, formatTags, topTags
} from '../src/search.js'

// parseSearchQuery
test('parseSearchQuery: all: sets filters.all', () => {
  assert.equal(parseSearchQuery('all:').all, true)
})

test('parseSearchQuery: status: sets filters.status (long form)', () => {
  assert.equal(parseSearchQuery('status:archive').status, 'archive')
})

test('parseSearchQuery: inbox: sets status to inbox (short form)', () => {
  assert.equal(parseSearchQuery('inbox:').status, 'inbox')
})

test('parseSearchQuery: archive: sets status to archive (short form)', () => {
  assert.equal(parseSearchQuery('archive:').status, 'archive')
})

test('parseSearchQuery: spam: and trash: short forms work', () => {
  assert.equal(parseSearchQuery('spam:').status, 'spam')
  assert.equal(parseSearchQuery('trash:').status, 'trash')
})

test('parseSearchQuery: unrecognized word: strips colon to avoid FTS5 column-filter syntax error', () => {
  assert.equal(parseSearchQuery('bullshit:').text, 'bullshit')
  assert.equal(parseSearchQuery('bullshit:').status, null)
})

test('parseSearchQuery: tag: is repeatable and AND-only', () => {
  const filters = parseSearchQuery('tag:taxes tag:2026')
  assert.deepEqual(filters.tags, ['taxes', '2026'])
})

test('parseSearchQuery: starred: sets filters.starred (short form)', () => {
  assert.equal(parseSearchQuery('starred:').starred, true)
})

test('parseSearchQuery: is:starred also sets filters.starred (backwards compat)', () => {
  assert.equal(parseSearchQuery('is:starred').starred, true)
})

test('parseSearchQuery: sent: sets filters.sent', () => {
  assert.equal(parseSearchQuery('sent:').sent, true)
})

test('parseSearchQuery: default filters.sent is false', () => {
  assert.equal(parseSearchQuery('').sent, false)
})

test('parseSearchQuery: unrecognized tokens become free text', () => {
  assert.equal(parseSearchQuery('quarterly report').text, 'quarterly report')
})

test('parseSearchQuery: mixes filters and free text', () => {
  const filters = parseSearchQuery('status:archive tag:taxes invoice pdf')
  assert.equal(filters.status, 'archive')
  assert.deepEqual(filters.tags, ['taxes'])
  assert.equal(filters.text, 'invoice pdf')
})

test('parseSearchQuery: empty string returns all-neutral filters', () => {
  const filters = parseSearchQuery('')
  assert.equal(filters.all, false)
  assert.equal(filters.status, null)
  assert.deepEqual(filters.tags, [])
  assert.equal(filters.starred, false)
  assert.equal(filters.text, '')
})

test('parseSearchQuery: extra whitespace is ignored', () => {
  const filters = parseSearchQuery('  status:inbox    tag:x  ')
  assert.equal(filters.status, 'inbox')
  assert.deepEqual(filters.tags, ['x'])
})

// stringifySearchFilters - round-trip with parseSearchQuery
test('stringifySearchFilters: round-trips a full filter set', () => {
  // stringify emits short-form tokens (archive: not status:archive), but
  // the re-parsed result should be identical to the original parse
  const original = 'all: status:archive tag:taxes tag:2026 is:starred invoice'
  const filters = parseSearchQuery(original)
  const stringified = stringifySearchFilters(filters)
  const reparsed = parseSearchQuery(stringified)
  assert.deepEqual(reparsed, filters)
})

test('stringifySearchFilters: emits short-form status tokens', () => {
  assert.equal(stringifySearchFilters({ status: 'inbox', all: false, sent: false, tags: [], starred: false, text: '' }), 'inbox:')
  assert.equal(stringifySearchFilters({ status: 'archive', all: false, sent: false, tags: [], starred: false, text: '' }), 'archive:')
})

test('stringifySearchFilters: empty filters produce empty string', () => {
  assert.equal(stringifySearchFilters(parseSearchQuery('')), '')
})

// resolveEffectiveQuery - the default-to-inbox policy
test('resolveEffectiveQuery: empty query defaults to status:inbox', () => {
  assert.equal(resolveEffectiveQuery('').status, 'inbox')
})

test('resolveEffectiveQuery: all: is left alone, not overridden to inbox', () => {
  const filters = resolveEffectiveQuery('all:')
  assert.equal(filters.all, true)
  assert.equal(filters.status, null)
})

test('resolveEffectiveQuery: explicit status is preserved (long and short form)', () => {
  assert.equal(resolveEffectiveQuery('status:trash').status, 'trash')
  assert.equal(resolveEffectiveQuery('trash:').status, 'trash')
})

test('resolveEffectiveQuery: a bare search term does not force status:inbox', () => {
  const filters = resolveEffectiveQuery('invoice')
  assert.equal(filters.status, null)
  assert.equal(filters.text, 'invoice')
})

test('resolveEffectiveQuery: invalid status falls back to inbox', () => {
  assert.equal(resolveEffectiveQuery('status:bogus').status, 'inbox')
})

test('resolveEffectiveQuery: tag: alone does not force status:inbox', () => {
  assert.equal(resolveEffectiveQuery('tag:taxes').status, null)
})

test('resolveEffectiveQuery: sent: is not overridden to status:inbox', () => {
  const filters = resolveEffectiveQuery('sent:')
  assert.equal(filters.sent, true)
  assert.equal(filters.status, null)
})

test('stringifySearchFilters: round-trips sent:', () => {
  const filters = parseSearchQuery('sent:')
  assert.equal(stringifySearchFilters(filters), 'sent:')
})

// parseTags / formatTags
test('parseTags: splits and trims a comma-separated string', () => {
  assert.deepEqual(parseTags('taxes, 2026 ,work'), ['taxes', '2026', 'work'])
})

test('parseTags: handles null/empty', () => {
  assert.deepEqual(parseTags(null), [])
  assert.deepEqual(parseTags(''), [])
})

test('parseTags: drops empty entries from stray commas', () => {
  assert.deepEqual(parseTags('taxes,,work,'), ['taxes', 'work'])
})

test('formatTags: joins and trims back into a comma-separated string', () => {
  assert.equal(formatTags(['taxes', ' 2026 ', 'work']), 'taxes,2026,work')
})

test('formatTags/parseTags: round-trip', () => {
  const tags = ['taxes', '2026', 'work']
  assert.deepEqual(parseTags(formatTags(tags)), tags)
})

// topTags
test('topTags: counts frequency across multiple emails, most-used first', () => {
  const result = topTags(['taxes,work', 'taxes', 'work,taxes', 'personal'])
  assert.deepEqual(result[0], { tag: 'taxes', count: 3 })
  assert.deepEqual(result[1], { tag: 'work', count: 2 })
})

test('topTags: respects the limit', () => {
  const result = topTags(['a', 'b', 'c', 'd'], 2)
  assert.equal(result.length, 2)
})

test('topTags: handles nulls/empties in the input list', () => {
  const result = topTags([null, '', 'taxes', undefined])
  assert.deepEqual(result, [{ tag: 'taxes', count: 1 }])
})
