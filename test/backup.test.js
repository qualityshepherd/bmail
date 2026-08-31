import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sqlVal } from '../src/backup.js'

test('sqlVal: null → NULL', () => {
  assert.equal(sqlVal(null), 'NULL')
})

test('sqlVal: undefined → NULL', () => {
  assert.equal(sqlVal(undefined), 'NULL')
})

test('sqlVal: integer → bare number', () => {
  assert.equal(sqlVal(42), '42')
})

test('sqlVal: zero → bare number', () => {
  assert.equal(sqlVal(0), '0')
})

test('sqlVal: float → bare number', () => {
  assert.equal(sqlVal(3.14), '3.14')
})

test('sqlVal: true → 1', () => {
  assert.equal(sqlVal(true), '1')
})

test('sqlVal: false → 0', () => {
  assert.equal(sqlVal(false), '0')
})

test('sqlVal: plain string → single-quoted', () => {
  assert.equal(sqlVal('hello'), "'hello'")
})

test('sqlVal: string with single quote → doubled', () => {
  assert.equal(sqlVal("it's"), "'it''s'")
})

test('sqlVal: string with multiple single quotes → all doubled', () => {
  assert.equal(sqlVal("it's a dog's life"), "'it''s a dog''s life'")
})

test('sqlVal: empty string → empty quoted string', () => {
  assert.equal(sqlVal(''), "''")
})

test('sqlVal: string with SQL injection attempt → safely quoted', () => {
  assert.equal(sqlVal("'; DROP TABLE emails; --"), "'''; DROP TABLE emails; --'")
})
