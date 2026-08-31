import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isInlineSafe, sanitizeFilename, contentDispositionValue } from '../src/attachment-download.js'

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

test('contentDispositionValue: ascii filename matches in both parts', () => {
  const value = contentDispositionValue('attachment', 'report.pdf')
  assert.equal(value, 'attachment; filename="report.pdf"; filename*=UTF-8\'\'report.pdf')
})

test('contentDispositionValue: non-ascii filename gets ascii fallback plus UTF-8 filename*', () => {
  const value = contentDispositionValue('attachment', 'résumé.pdf')
  assert.match(value, /filename="r_sum_\.pdf"/)
  assert.match(value, /filename\*=UTF-8''r%C3%A9sum%C3%A9\.pdf/)
})

test('contentDispositionValue: non-ascii chars become underscores but the ascii extension survives', () => {
  const value = contentDispositionValue('attachment', '日本語.pdf')
  assert.match(value, /filename="___\.pdf"/)
})

test('contentDispositionValue: falls back to "attachment" when the filename is empty', () => {
  const value = contentDispositionValue('attachment', '')
  assert.match(value, /filename="attachment"/)
})

test('contentDispositionValue: CRLF and quotes are stripped before either part is built', () => {
  const value = contentDispositionValue('attachment', 'file\r\nX-Evil: injected".pdf')
  assert.ok(!value.includes('\r'))
  assert.ok(!value.includes('\n'))
})

test('sanitizeFilename: handles null/undefined', () => {
  assert.equal(sanitizeFilename(null), '')
  assert.equal(sanitizeFilename(undefined), '')
})
