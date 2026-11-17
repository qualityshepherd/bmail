import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseMailto } from '../src/mailto.js'
import { renderComposePage } from '../src/compose-page.js'

test('parseMailto: bare address', () => {
  assert.equal(parseMailto('mailto:brine@brine.dev').to, 'brine@brine.dev')
})

test('parseMailto: subject and body, with encoded line breaks', () => {
  const m = parseMailto('mailto:a@b.com?subject=Hi%20there&body=line%20one%0D%0Aline%20two')
  assert.equal(m.subject, 'Hi there')
  assert.equal(m.body, 'line one\nline two')
})

// URLSearchParams would turn this into "a tag@b.com"
test('parseMailto: + in an address stays a +', () => {
  assert.equal(parseMailto('mailto:a+tag@b.com').to, 'a+tag@b.com')
})

test('parseMailto: several addresses, plus to= in the query', () => {
  assert.equal(parseMailto('mailto:a@b.com,c@d.com?to=e@f.com').to, 'a@b.com, c@d.com, e@f.com')
})

test('parseMailto: cc and bcc kept separate, never folded into to', () => {
  const m = parseMailto('mailto:a@b.com?cc=c@d.com&bcc=secret@x.com')
  assert.equal(m.to, 'a@b.com')
  assert.equal(m.cc, 'c@d.com')
  assert.equal(m.bcc, 'secret@x.com')
})

test('parseMailto: keys are case-insensitive', () => {
  assert.equal(parseMailto('MAILTO:a@b.com?Subject=yo').subject, 'yo')
})

test('parseMailto: no address, just a subject', () => {
  const m = parseMailto('mailto:?subject=hello')
  assert.equal(m.to, '')
  assert.equal(m.subject, 'hello')
})

test('parseMailto: anything that is not a mailto gives nothing', () => {
  assert.deepEqual(parseMailto('https://evil.example'), {})
  assert.deepEqual(parseMailto(null), {})
  assert.deepEqual(parseMailto(''), {})
})

test('parseMailto: broken percent-encoding does not throw', () => {
  assert.equal(parseMailto('mailto:a@b.com?subject=100%').subject, '100%')
})

test('parseMailto: newlines in the subject are flattened', () => {
  assert.equal(parseMailto('mailto:a@b.com?subject=one%0D%0ABcc:%20x@y.com').subject, 'one Bcc: x@y.com')
})

test('parseMailto: unknown headers ignored', () => {
  const m = parseMailto('mailto:a@b.com?in-reply-to=%3Cid%3E&subject=s')
  assert.equal(m.subject, 's')
  assert.equal(Object.keys(m).includes('in-reply-to'), false)
})

test('parseMailto: huge body is capped', () => {
  assert.equal(parseMailto(`mailto:a@b.com?body=${'x'.repeat(60000)}`).body.length, 50000)
})

// the link comes from any site on the internet, so it has to land escaped
test('compose: prefilled values are escaped', () => {
  const html = renderComposePage(
    [{ address: 'me@x.com', name: '' }], [],
    parseMailto('mailto:a@b.com?subject=%22%3E%3Cscript%3Ealert(1)%3C/script%3E&body=%3C/textarea%3E%3Cimg%20src=x%3E')
  )
  assert.equal(html.includes('<script>alert(1)'), false)
  assert.equal(html.includes('</textarea><img'), false)
})

test('compose: a prefilled cc shows its row and hides its toggle', () => {
  const html = renderComposePage([{ address: 'me@x.com', name: '' }], [], parseMailto('mailto:a@b.com?cc=c@d.com'))
  assert.match(html, /class="compose-row" for="cc"/)
  assert.match(html, /id="show-cc" class="compose-hidden"/)
  assert.match(html, /class="compose-row compose-hidden" for="bcc"/)
})
