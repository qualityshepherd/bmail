import { test as nodeTest } from 'node:test'
import assert from 'node:assert/strict'
import puppeteer from 'puppeteer'
import fs from 'node:fs/promises'
import path from 'node:path'

// https://github.com/qualityshepherd/testpup

function assertDsl (t) {
  t.is = (a, b, msg) => assert.strictEqual(a, b, msg)
  t.not = (a, b, msg) => assert.notStrictEqual(a, b, msg)
  t.deepEqual = (a, b, msg) => assert.deepStrictEqual(a, b, msg)
  t.ok = (val, msg) => assert.ok(val, msg)
  t.falsy = (val, msg) => assert.ok(!val, msg)
  t.match = (s, re, msg) => assert.match(s, re, msg)
  t.throws = (fn, msg) => assert.throws(fn, msg)
  t.throwsAsync = (p, msg) => assert.rejects(p, msg)
  t.pass = () => {}
  t.fail = (msg) => assert.fail(msg)
  t.contains = (hay, needle, msg) => {
    assert.ok(hay?.includes(needle), msg || `Expected "${hay}" to contain "${needle}"`)
  }
}

function puppeteerDsl (t, page, browser) {
  Object.assign(t, {
    page,
    browser,
    goto: (url) => page.goto(url),
    url: () => page.url(),
    eval: (fn, ...args) => page.evaluate(fn, ...args),
    wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
    waitFor: (sel) => page.waitForSelector(sel),
    waitForNav: (opts) => page.waitForNavigation({ waitUntil: 'networkidle2', ...opts }),
    refresh: () => page.reload({ waitUntil: 'networkidle0', timeout: 1000 }),
    type: async (sel, txt) => { await page.waitForSelector(sel); await page.type(sel, txt) },
    waitAndClick: async (sel, opts) => {
      await page.waitForSelector(sel, opts)
      await page.click(sel)
    },
    exists: (sel) => page.$(sel).then(el => !!el),
    count: (sel) => page.$$eval(sel, els => els.length),
    getText: (sel) => page.$eval(sel, el => el.textContent),
    hasClass: (sel, cls) => page.$eval(sel, (el, c) => el.classList.contains(c), cls),
    inDom: async (sel) => { try { return !!(await page.$(sel)) } catch { return false } },
    isVisible: async (sel) => {
      try {
        const el = await page.$(sel)
        if (!el) return false
        return await page.$eval(sel, el => {
          const style = window.getComputedStyle(el)
          return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null
        })
      } catch { return false }
    }
  })
}

export { before, after, beforeEach, afterEach, test } from 'node:test'

export async function launchBrowser (options = {}) {
  const browser = await puppeteer.launch({
    headless: options.headless ?? (process.env.HEADLESS !== '0'),
    slowMo: options.slowMo ?? (process.env.SLOWMO ? Number(process.env.SLOWMO) : 0),
    args: ['--no-sandbox']
  })
  const page = await browser.newPage()
  page.on('dialog', dialog => dialog.dismiss())
  page.setDefaultTimeout(options.timeout ?? 10000)
  const t = {}
  assertDsl(t)
  puppeteerDsl(t, page, browser)
  return t
}

export function unit (name, testFn) {
  return nodeTest(name, async (t) => {
    assertDsl(t)
    await testFn(t)
  })
}

export function e2e (name, testFn, options = {}) {
  const maxRetries = options.retries ?? 2
  const retryDelay = options.retryDelay ?? 1000

  return nodeTest(name, async () => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const t = await launchBrowser(options)
      try {
        await testFn(t)
        return
      } catch (err) {
        if (attempt === maxRetries) {
          const errDir = path.join(process.cwd(), 'test/errors')
          await fs.mkdir(errDir, { recursive: true })
          await t.page.screenshot({ path: path.join(errDir, `err-${Date.now()}.png`), fullPage: true }).catch(() => {})
          throw err
        }
        await new Promise(resolve => setTimeout(resolve, retryDelay))
      } finally {
        await t.browser.close()
      }
    }
  })
}
