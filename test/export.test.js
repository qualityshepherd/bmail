import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escapeBody } from '../src/export-handler.js'

test('escapeBody: plain text passes through unchanged', () => {
  assert.equal(escapeBody('Hello world'), 'Hello world')
})

test('escapeBody: null/undefined → empty string', () => {
  assert.equal(escapeBody(null), '')
  assert.equal(escapeBody(undefined), '')
})

test('escapeBody: line starting with "From " → ">From "', () => {
  const out = escapeBody('From someone@example.com Mon Jan 1 00:00:00 2026')
  assert.equal(out, '>From someone@example.com Mon Jan 1 00:00:00 2026')
})

test('escapeBody: mid-body "From " line is escaped', () => {
  const input = 'Hello\nFrom evil@example.com date\nbye'
  const out = escapeBody(input)
  assert.ok(out.includes('>From evil@example.com'))
  assert.ok(!out.includes('\nFrom '))
})

test('escapeBody: multiple "From " lines are all escaped', () => {
  const input = 'From a@example.com\nFrom b@example.com'
  const out = escapeBody(input)
  assert.equal(out.split('>From ').length - 1, 2)
})

test('escapeBody: "From" without trailing space is not escaped', () => {
  const out = escapeBody('Fromage is a type of cheese')
  assert.equal(out, 'Fromage is a type of cheese')
})

test('escapeBody: "from " lowercase is not escaped', () => {
  const out = escapeBody('from someone@example.com')
  assert.equal(out, 'from someone@example.com')
})

test('escapeBody: already-escaped ">From " is left alone', () => {
  const out = escapeBody('>From already escaped')
  assert.equal(out, '>From already escaped')
})
