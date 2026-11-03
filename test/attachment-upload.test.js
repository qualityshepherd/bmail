import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildAttachments, MAX_ATTACHMENT_BYTES, MAX_TOTAL_ATTACHMENT_BYTES } from '../src/attachment-upload.js'

test('buildAttachments: encodes real file content to base64', async () => {
  const file = new File(['hello world'], 'note.txt', { type: 'text/plain' })
  const [result] = await buildAttachments([file])
  assert.equal(result.filename, 'note.txt')
  assert.equal(result.type, 'text/plain')
  assert.equal(Buffer.from(result.content, 'base64').toString(), 'hello world')
})

test('buildAttachments: missing type falls back to octet-stream', async () => {
  const file = new File(['x'], 'blob')
  const [result] = await buildAttachments([file])
  assert.equal(result.type, 'application/octet-stream')
})

test('buildAttachments: empty list returns empty array', async () => {
  assert.deepEqual(await buildAttachments([]), [])
})

test('buildAttachments: rejects a single file over the per-file limit', async () => {
  const big = new File([new Uint8Array(MAX_ATTACHMENT_BYTES + 1)], 'huge.bin')
  await assert.rejects(buildAttachments([big]), /huge\.bin.*exceeds 15MB/)
})

test('buildAttachments: rejects when the combined total exceeds the cap, even if no single file does', async () => {
  // Each file is under the 15MB per-file limit on its own; three of them
  // together are over the 40MB total cap.
  const chunk = 14 * 1024 * 1024
  assert.ok(chunk < MAX_ATTACHMENT_BYTES)
  assert.ok(chunk * 3 > MAX_TOTAL_ATTACHMENT_BYTES)
  const files = ['a.bin', 'b.bin', 'c.bin'].map((name) => new File([new Uint8Array(chunk)], name))
  await assert.rejects(buildAttachments(files), /Total attachments exceed 40MB/)
})

test('buildAttachments: preserves order across multiple files', async () => {
  const files = [
    new File(['one'], 'a.txt'),
    new File(['two'], 'b.txt'),
    new File(['three'], 'c.txt')
  ]
  const results = await buildAttachments(files)
  assert.deepEqual(results.map((r) => r.filename), ['a.txt', 'b.txt', 'c.txt'])
})
