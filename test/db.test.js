import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isDuplicateKeyError } from '../src/db.js'

test('isDuplicateKeyError: true for a real D1 unique constraint error', () => {
  const err = new Error('D1_ERROR: UNIQUE constraint failed: emails.message_id')
  assert.equal(isDuplicateKeyError(err), true)
})

test('isDuplicateKeyError: false for an unrelated error', () => {
  const err = new Error('D1_ERROR: no such table: emails')
  assert.equal(isDuplicateKeyError(err), false)
})

test('isDuplicateKeyError: false for null/undefined', () => {
  assert.equal(isDuplicateKeyError(null), false)
  assert.equal(isDuplicateKeyError(undefined), false)
})

test('isDuplicateKeyError: false for a non-Error object without a message', () => {
  assert.equal(isDuplicateKeyError({}), false)
})
