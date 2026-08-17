import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escapeHtml, formatDate, formatBytes, linkify } from '../src/html.js'

// escapeHtml - this is the actual defense against a malicious sender
// putting markup in a subject/sender/body that later gets rendered.
test('escapeHtml: escapes script tags', () => {
  const result = escapeHtml('<script>alert(1)</script>')
  assert.equal(result.includes('<script>'), false)
  assert.equal(result, '&lt;script&gt;alert(1)&lt;/script&gt;')
})

test('escapeHtml: escapes double quotes (attribute-breakout risk)', () => {
  const result = escapeHtml('"><img src=x onerror=alert(1)>')
  assert.equal(result.includes('"'), false)
  assert.match(result, /&quot;/)
})

test('escapeHtml: escapes single quotes', () => {
  const result = escapeHtml("' onmouseover='alert(1)")
  assert.equal(result.includes("'"), false)
  assert.match(result, /&#039;/)
})

test('escapeHtml: escapes ampersands', () => {
  assert.equal(escapeHtml('Tom & Jerry'), 'Tom &amp; Jerry')
})

test('escapeHtml: escapes ampersands before other entities (no double-escaping)', () => {
  // If & were escaped after < and >, "<" would become "&amp;lt;" instead
  // of "&lt;" - order matters here.
  assert.equal(escapeHtml('<'), '&lt;')
  assert.equal(escapeHtml('&lt;'), '&amp;lt;')
})

test('escapeHtml: plain text passes through unchanged', () => {
  assert.equal(escapeHtml('Hello, world!'), 'Hello, world!')
})

test('escapeHtml: handles non-string input by coercing to string', () => {
  assert.equal(escapeHtml(42), '42')
  assert.equal(escapeHtml(null), 'null')
})

test('escapeHtml: empty string returns empty string', () => {
  assert.equal(escapeHtml(''), '')
})

// formatDate
test('formatDate: returns a non-empty string for a valid timestamp', () => {
  const result = formatDate(Date.now())
  assert.equal(typeof result, 'string')
  assert.ok(result.length > 0)
})

test('formatDate: different timestamps produce different output', () => {
  const a = formatDate(new Date('2026-01-01T12:00:00Z').getTime())
  const b = formatDate(new Date('2026-06-15T18:30:00Z').getTime())
  assert.notEqual(a, b)
})

// formatBytes
test('formatBytes: bytes under 1KB shown as B', () => {
  assert.equal(formatBytes(512), '512 B')
})

test('formatBytes: kilobytes shown as KB with one decimal', () => {
  assert.equal(formatBytes(2048), '2.0 KB')
})

test('formatBytes: megabytes shown as MB with one decimal', () => {
  assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB')
})

test('formatBytes: boundary at exactly 1024 bytes rolls to KB', () => {
  assert.equal(formatBytes(1024), '1.0 KB')
})

// linkify
test('linkify: plain text passes through escaped', () => {
  assert.equal(linkify('Hello & welcome'), 'Hello &amp; welcome')
})

test('linkify: https URL becomes a link', () => {
  const out = linkify('visit https://example.com today')
  assert.ok(out.includes('<a href="https://example.com"'))
  assert.ok(out.includes('target="_blank"'))
  assert.ok(out.includes('rel="noopener noreferrer"'))
  assert.ok(out.includes('visit '))
  assert.ok(out.includes(' today'))
})

test('linkify: http URL becomes a link', () => {
  const out = linkify('http://example.com')
  assert.ok(out.includes('<a href="http://example.com"'))
})

test('linkify: email address becomes a mailto link', () => {
  const out = linkify('contact me at hello@example.com please')
  assert.ok(out.includes('<a href="mailto:hello@example.com"'))
  assert.ok(out.includes('contact me at '))
  assert.ok(out.includes(' please'))
})

test('linkify: strips trailing period from URL', () => {
  const out = linkify('see https://example.com. thanks')
  assert.ok(out.includes('href="https://example.com"'))
  assert.ok(!out.includes('href="https://example.com."'))
  // period should still appear as text after the link
  assert.ok(out.includes('</a>.'))
})

test('linkify: strips trailing comma from URL', () => {
  const out = linkify('https://example.com, and also')
  assert.ok(out.includes('href="https://example.com"'))
  assert.ok(out.includes('</a>,'))
})

test('linkify: preserves parens in Wikipedia-style URLs', () => {
  const out = linkify('https://en.wikipedia.org/wiki/Foo_(bar)')
  assert.ok(out.includes('href="https://en.wikipedia.org/wiki/Foo_(bar)"'))
})

test('linkify: strips trailing paren when URL has no open paren', () => {
  const out = linkify('(https://example.com)')
  assert.ok(out.includes('href="https://example.com"'))
  assert.ok(out.includes('</a>)'))
})

test('linkify: URL with query string and ampersand is linked and href-escaped', () => {
  const out = linkify('https://example.com/?a=1&b=2')
  assert.ok(out.includes('href="https://example.com/?a=1&amp;b=2"'))
})

test('linkify: javascript: scheme is never linked', () => {
  const out = linkify('javascript:alert(1)')
  assert.ok(!out.includes('<a'))
  assert.ok(!out.includes('href'))
})

test('linkify: URL containing double-quote cannot break out of href attribute', () => {
  // The " is excluded by the URL regex so the match stops before it;
  // the dangerous suffix is escaped into the text node, not an attribute
  const out = linkify('https://example.com/"onmouseover="alert(1)')
  // Unescaped " must not appear outside of our own hardcoded attribute quotes
  // i.e. the attack payload is rendered as &quot;, never as a live "
  assert.ok(!out.includes('"onmouseover'))
  // The safe part of the URL is still linked
  assert.ok(out.includes('href="https://example.com/'))
})

test('linkify: attacker-controlled text between URLs is still escaped', () => {
  const out = linkify('<script> https://example.com </script>')
  assert.ok(!out.includes('<script>'))
  assert.ok(out.includes('&lt;script&gt;'))
})

test('linkify: multiple URLs in one string all become links', () => {
  const out = linkify('a https://one.com b https://two.com c')
  assert.ok(out.includes('href="https://one.com"'))
  assert.ok(out.includes('href="https://two.com"'))
})

test('linkify: empty string returns empty string', () => {
  assert.equal(linkify(''), '')
})

test('linkify: no URLs or emails returns fully escaped text', () => {
  assert.equal(linkify('just plain text'), 'just plain text')
})
