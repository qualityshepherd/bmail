import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isInlineSafe, sanitizeFilename } from '../src/attachment-download.js'

test('isInlineSafe: images are inline-safe', () => {
  assert.equal(isInlineSafe('image/png'), true)
  assert.equal(isInlineSafe('image/jpeg'), true)
  assert.equal(isInlineSafe('image/gif'), true)
})

test('isInlineSafe: video is inline-safe', () => {
  assert.equal(isInlineSafe('video/mp4'), true)
})

test('isInlineSafe: pdf is inline-safe', () => {
  assert.equal(isInlineSafe('application/pdf'), true)
})

test('isInlineSafe: html is NOT inline-safe - the actual thing this guards against', () => {
  assert.equal(isInlineSafe('text/html'), false)
})

test('isInlineSafe: svg is NOT inline-safe (can contain embedded script)', () => {
  assert.equal(isInlineSafe('image/svg+xml'), false)
})

test('isInlineSafe: generic/unknown types are not inline-safe by default', () => {
  assert.equal(isInlineSafe('application/octet-stream'), false)
  assert.equal(isInlineSafe('application/zip'), false)
})

test('isInlineSafe: missing/empty content type is not inline-safe', () => {
  assert.equal(isInlineSafe(null), false)
  assert.equal(isInlineSafe(''), false)
  assert.equal(isInlineSafe(undefined), false)
})

test('sanitizeFilename: strips CR and LF to prevent header injection', () => {
  assert.equal(sanitizeFilename('file\r\nX-Evil: injected'), 'fileX-Evil: injected')
  assert.equal(sanitizeFilename('file\nX-Evil: injected'), 'fileX-Evil: injected')
  assert.equal(sanitizeFilename('file\rX-Evil: injected'), 'fileX-Evil: injected')
})

test('sanitizeFilename: strips double quotes', () => {
  assert.equal(sanitizeFilename('my"file".pdf'), 'myfile.pdf')
})

test('sanitizeFilename: plain filenames pass through unchanged', () => {
  assert.equal(sanitizeFilename('report 2026.pdf'), 'report 2026.pdf')
})

test('sanitizeFilename: handles null/undefined', () => {
  assert.equal(sanitizeFilename(null), '')
  assert.equal(sanitizeFilename(undefined), '')
})
