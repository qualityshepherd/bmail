import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractPastedImages, ensureFilename } from '../public/paste-attach.js'

function fakeItem (kind, type, file) {
  return { kind, type, getAsFile: () => file }
}

test('extractPastedImages: keeps only file items with an image type', () => {
  const imgFile = new File([new Blob(['x'])], 'foo.png', { type: 'image/png' })
  const items = [
    fakeItem('file', 'image/png', imgFile),
    fakeItem('file', 'text/plain', new File([new Blob(['y'])], 'note.txt', { type: 'text/plain' })),
    fakeItem('string', 'text/plain', null)
  ]
  const result = extractPastedImages(items)
  assert.equal(result.length, 1)
  assert.equal(result[0], imgFile)
})

test('extractPastedImages: returns empty array when nothing pasted', () => {
  assert.deepEqual(extractPastedImages([]), [])
})

test('ensureFilename: keeps the base name but uniquifies a named file', () => {
  const file = new File([new Blob(['x'])], 'image.png', { type: 'image/png' })
  const result = ensureFilename(file)
  assert.match(result.name, /^image-[0-9a-f]{8}\.png$/)
  assert.equal(result.type, 'image/png')
})

test('ensureFilename: two pastes sharing the OS-given "image.png" name get distinct results', () => {
  const a = ensureFilename(new File([new Blob(['x'])], 'image.png', { type: 'image/png' }))
  const b = ensureFilename(new File([new Blob(['y'])], 'image.png', { type: 'image/png' }))
  assert.notEqual(a.name, b.name)
})

test('ensureFilename: synthesizes a base name for a truly nameless file', () => {
  const file = new File([new Blob(['x'])], '', { type: 'image/png' })
  const result = ensureFilename(file)
  assert.match(result.name, /^pasted-image-[0-9a-f]{8}\.png$/)
})

test('ensureFilename: falls back to png extension for a malformed mime type', () => {
  const file = new File([new Blob(['x'])], '', { type: 'image/' })
  const result = ensureFilename(file)
  assert.match(result.name, /^pasted-image-[0-9a-f]{8}\.png$/)
})
