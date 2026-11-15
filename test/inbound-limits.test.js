import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isOversizedRawMessage, attachmentAllowed,
  MAX_RAW_BYTES, MAX_ATTACHMENT_BYTES, MAX_TOTAL_ATTACHMENT_BYTES, MAX_ATTACHMENT_COUNT
} from '../src/inbound-limits.js'

test('isOversizedRawMessage: under the cap is fine', () => {
  assert.equal(isOversizedRawMessage(MAX_RAW_BYTES - 1), false)
})

test('isOversizedRawMessage: exactly at the cap is fine', () => {
  assert.equal(isOversizedRawMessage(MAX_RAW_BYTES), false)
})

test('isOversizedRawMessage: over the cap is rejected', () => {
  assert.equal(isOversizedRawMessage(MAX_RAW_BYTES + 1), true)
})

test('attachmentAllowed: fits comfortably under every limit', () => {
  assert.equal(attachmentAllowed({ byteLength: 1024, totalBytesSoFar: 0, countSoFar: 0 }), true)
})

test('attachmentAllowed: single file over the per-file cap is rejected', () => {
  assert.equal(attachmentAllowed({ byteLength: MAX_ATTACHMENT_BYTES + 1, totalBytesSoFar: 0, countSoFar: 0 }), false)
})

test('attachmentAllowed: exactly at the per-file cap is allowed', () => {
  assert.equal(attachmentAllowed({ byteLength: MAX_ATTACHMENT_BYTES, totalBytesSoFar: 0, countSoFar: 0 }), true)
})

test('attachmentAllowed: would push the running total over the cap is rejected', () => {
  assert.equal(attachmentAllowed({ byteLength: 10, totalBytesSoFar: MAX_TOTAL_ATTACHMENT_BYTES - 5, countSoFar: 0 }), false)
})

test('attachmentAllowed: already at the max count is rejected regardless of size', () => {
  assert.equal(attachmentAllowed({ byteLength: 1, totalBytesSoFar: 0, countSoFar: MAX_ATTACHMENT_COUNT }), false)
})

test('attachmentAllowed: one below the max count is still allowed', () => {
  assert.equal(attachmentAllowed({ byteLength: 1, totalBytesSoFar: 0, countSoFar: MAX_ATTACHMENT_COUNT - 1 }), true)
})
