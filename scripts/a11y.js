// Accessibility audit. Renders each page the way the worker would, loads it
// into headless Chrome with the real stylesheets, and runs axe-core.
//
// A real browser rather than jsdom on purpose: colour-contrast and
// hidden-element rules need actual layout and computed styles, which is
// most of what we care about on a dark theme.
//
//   node scripts/a11y.js            all pages
//   node scripts/a11y.js inbox      just one

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import puppeteer from 'puppeteer'

import { renderInboxPage } from '../src/inbox.js'
import { renderMessagePage } from '../src/message-view.js'
import { renderSentPage } from '../src/sent-view.js'
import { renderSettingsPage } from '../src/settings-page.js'
import { renderComposePage } from '../src/compose-page.js'
import { renderLoginPage } from '../src/login-page.js'

const require = createRequire(import.meta.url)
const AXE = readFileSync(require.resolve('axe-core'), 'utf8')
const css = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8')

const identity = { address: 'brine@example.com', name: 'brine', avatarUrl: '' }

// A contact with a photo and one without, so both avatar branches render.
const contacts = new Map([
  ['jane@example.com', { name: 'Jane Smith', avatarUrl: '/avatar/jane%40example.com' }],
  ['bob@example.com', { name: '', avatarUrl: '' }]
])

const email = (id, over = {}) => ({
  id,
  sender: 'jane@example.com',
  sender_display: 'Jane Smith',
  recipient: 'brine@example.com',
  subject: 'Quarterly report',
  preview: 'Here is the thing you asked about, with a reasonably long preview line.',
  tags: 'work,urgent',
  starred: id % 2 === 0,
  read: id % 3 === 0,
  status: 'inbox',
  dmarc_result: 'pass',
  created_at: Date.now() - id * 3600000,
  body: 'Hello,\n\nPlain text body with a link https://example.com in it.\n\nJane',
  ...over
})

const emails = [
  email(1),
  email(2, { sender: 'bob@example.com', sender_display: '', subject: '', dmarc_result: 'fail' }),
  email(3, { status: 'archived', starred: true, tags: '' })
]

const PAGES = {
  login: { css: ['base.css', 'login.css'], html: () => renderLoginPage() },

  inbox: {
    css: ['base.css', 'inbox.css'],
    html: () => renderInboxPage({
      emails,
      total: emails.length,
      effectiveQuery: '',
      tags: [{ tag: 'work', count: 12 }, { tag: 'urgent', count: 3 }],
      currentUrl: '/inbox',
      unreadCount: 2,
      unreadSpamCount: 1,
      identity,
      bgImage: '',
      contacts
    })
  },

  message: {
    css: ['base.css', 'compose.css', 'message.css'],
    html: () => renderMessagePage(
      email(1),
      [{ id: 9, filename: 'report.pdf', content_type: 'application/pdf', size: 20480 }],
      {
        sent: false,
        backParam: '/inbox',
        prevId: 2,
        nextId: 3,
        identities: [identity],
        allTags: ['work', 'urgent'],
        identity,
        bgImage: '',
        contact: contacts.get('jane@example.com'),
        allContacts: [{ email: 'jane@example.com', name: 'Jane Smith' }]
      }
    )
  },

  sent: {
    css: ['base.css', 'message.css'],
    html: () => renderSentPage(
      {
        id: 4,
        to_address: 'jane@example.com, bob@example.com',
        subject: 'Re: Quarterly report',
        body: 'Sounds good.',
        created_at: Date.now(),
        send_status: 'sent'
      },
      '/inbox?q=sent',
      { identity, bgImage: '', contacts }
    )
  },

  compose: {
    css: ['base.css', 'compose.css'],
    html: () => renderComposePage(
      [identity],
      [{ email: 'jane@example.com', name: 'Jane Smith' }],
      {},
      { identity, bgImage: '' }
    )
  }
}

// Every settings tab is a different form, so each gets its own pass.
for (const tab of ['identities', 'appearance', 'contacts', 'filters', 'export']) {
  PAGES[`settings:${tab}`] = {
    css: ['base.css', 'settings.css'],
    html: () => renderSettingsPage(
      tab,
      'brine@example.com,brine,',
      'https://example.com/a.jpg\n*https://example.com/b.jpg',
      42, 'spam@bad.com', 'blocked@bad.com', false, 3
    )
  }
}

const only = process.argv[2]
const names = Object.keys(PAGES).filter((n) => !only || n.startsWith(only))

const browser = await puppeteer.launch({ headless: 'new' })
let totalViolations = 0
const summary = []

for (const name of names) {
  const { html, css: sheets } = PAGES[name]
  const page = await browser.newPage()
  await page.setViewport({ width: 1100, height: 900 })

  // The markup links stylesheets by absolute path, which setContent can't
  // resolve - strip the links and inject the real files instead.
  await page.setContent(html().replace(/<link rel="stylesheet"[^>]*>/g, ''), { waitUntil: 'domcontentloaded' })
  for (const sheet of sheets) await page.addStyleTag({ content: css(sheet) })
  await page.addScriptTag({ content: AXE })

  const results = await page.evaluate(async () => {
    /* global axe */
    return axe.run(document, {
      resultTypes: ['violations'],
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] }
    })
  })

  const violations = results.violations
  totalViolations += violations.length
  summary.push([name, violations.length])

  if (violations.length) {
    console.log(`\n${'='.repeat(64)}\n${name}\n${'='.repeat(64)}`)
    for (const v of violations) {
      console.log(`\n  [${v.impact}] ${v.id} - ${v.help}  (x${v.nodes.length})`)
      for (const node of v.nodes.slice(0, 3)) {
        console.log(`    ${node.target.join(' ')}`)
        const msg = (node.failureSummary || '').split('\n').filter(Boolean).slice(1, 3)
        for (const line of msg) console.log(`      ${line.trim()}`)
      }
      if (v.nodes.length > 3) console.log(`    ...and ${v.nodes.length - 3} more`)
    }
  }
  await page.close()
}

await browser.close()

console.log(`\n${'='.repeat(64)}`)
for (const [name, n] of summary) {
  console.log(`  ${n === 0 ? 'pass' : `${n} violation${n === 1 ? '' : 's'}`}`.padEnd(18) + name)
}
console.log(`${'='.repeat(64)}\n${totalViolations} violation${totalViolations === 1 ? '' : 's'} across ${names.length} page${names.length === 1 ? '' : 's'}\n`)
process.exit(totalViolations ? 1 : 0)
