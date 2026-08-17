import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseVCards } from '../src/contacts.js'

test('parseVCards: basic vCard 3.0', () => {
  const vcf = `BEGIN:VCARD
VERSION:3.0
FN:Jane Smith
EMAIL:jane@example.com
END:VCARD`
  const results = parseVCards(vcf)
  assert.equal(results.length, 1)
  assert.equal(results[0].email, 'jane@example.com')
  assert.equal(results[0].name, 'Jane Smith')
})

test('parseVCards: Apple Contacts group-prefixed email (item1.EMAIL)', () => {
  const vcf = `BEGIN:VCARD
VERSION:3.0
FN:Valerie Ray
item1.EMAIL;TYPE=INTERNET:valwy1@gmail.com
item1.X-ABLabel:
END:VCARD`
  const results = parseVCards(vcf)
  assert.equal(results.length, 1)
  assert.equal(results[0].email, 'valwy1@gmail.com')
  assert.equal(results[0].name, 'Valerie Ray')
})

test('parseVCards: folded photo URL is unfolded and captured', () => {
  const vcf = 'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Test User\r\nEMAIL:test@example.com\r\nPHOTO:https://example.com/photo\r\n longurl\r\nEND:VCARD'
  const results = parseVCards(vcf)
  assert.equal(results[0].avatarUrl, 'https://example.com/photolongurl')
})

test('parseVCards: skips base64 photos', () => {
  const vcf = `BEGIN:VCARD
VERSION:3.0
FN:Test User
EMAIL:test@example.com
PHOTO;ENCODING=BASE64;TYPE=JPEG:/9j/abc123
END:VCARD`
  const results = parseVCards(vcf)
  assert.equal(results[0].avatarUrl, '')
})

test('parseVCards: skips contact with no email', () => {
  const vcf = `BEGIN:VCARD
VERSION:3.0
FN:No Email
TEL:555-1234
END:VCARD`
  assert.equal(parseVCards(vcf).length, 0)
})

test('parseVCards: multiple vCards in one file', () => {
  const vcf = `BEGIN:VCARD
FN:Alice
EMAIL:alice@example.com
END:VCARD
BEGIN:VCARD
FN:Bob
EMAIL:bob@example.com
END:VCARD`
  const results = parseVCards(vcf)
  assert.equal(results.length, 2)
  assert.equal(results[0].name, 'Alice')
  assert.equal(results[1].name, 'Bob')
})

test('parseVCards: PREF email wins over first-seen', () => {
  const vcf = `BEGIN:VCARD
FN:Test
EMAIL:first@example.com
EMAIL;TYPE=PREF:preferred@example.com
END:VCARD`
  const results = parseVCards(vcf)
  assert.equal(results[0].email, 'preferred@example.com')
})
