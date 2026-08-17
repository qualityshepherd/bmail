// Real browser e2e tests via testpup/Puppeteer - NOT hitting the API
// directly (that's what scripts/login.js and the unit tests already do).
// This clicks through the actual page: types a passphrase, submits the
// form, and confirms the browser really lands on a real session.
//
// Requires a live instance to test against - these DO run as part of
// `npm test` (the "e2e." prefix + ".test.js" suffix matches that glob on
// purpose, so all e2e tests sort and run together), but skip themselves
// cleanly unless BASE_URL and TEST_PASSPHRASE are both set. Use
// `npm run test:e2e` to run only the e2e-prefixed files in isolation.
//
// Setup:
//   1. Run `wrangler dev` in one terminal (defaults to http://localhost:8787)
//   2. Visit http://localhost:8787 once in a browser, run the setup form
//      with a known test passphrase, and set the resulting AUTH_PUBKEY in
//      wrangler.toml for local dev (or a separate test .dev.vars file)
//   3. Run: BASE_URL=http://localhost:8787 TEST_PASSPHRASE="..." npm run test:e2e

import { e2e } from './testpup.js'

const BASE_URL = process.env.BASE_URL
const TEST_PASSPHRASE = process.env.TEST_PASSPHRASE

if (!BASE_URL || !TEST_PASSPHRASE) {
  console.log('Skipping auth e2e tests - set BASE_URL and TEST_PASSPHRASE to run them (see comment at top of this file).')
} else {
  e2e('login page: correct passphrase logs in and lands on the dashboard', async (t) => {
    await t.goto(`${BASE_URL}/login`)
    await t.type('#passphrase', TEST_PASSPHRASE)
    await t.waitAndClick('#login-btn')
    await t.waitForNav()
    t.ok(t.url().includes('/dashboard'), 'expected to land on /dashboard after login')
    t.ok(await t.exists('.inbox'), 'expected the inbox list to be present')
  })

  e2e('login page: wrong passphrase shows an error, does not navigate away', async (t) => {
    await t.goto(`${BASE_URL}/login`)
    await t.type('#passphrase', 'definitely the wrong passphrase')
    await t.waitAndClick('#login-btn')
    await t.wait(1500) // give the failed request time to resolve and update #status
    t.ok(t.url().includes('/login'), 'expected to still be on /login after a failed attempt')
    const status = await t.getText('#status')
    t.ok(status.length > 0, 'expected an error message in #status')
  })

  e2e('dashboard: visiting while logged out shows a link to /login', async (t) => {
    await t.goto(`${BASE_URL}/dashboard`)
    t.ok(await t.exists('a[href="/login"]'), 'expected a login link on the 401 page')
  })

  e2e('login -> dashboard -> message view -> back to inbox', async (t) => {
    await t.goto(`${BASE_URL}/login`)
    await t.type('#passphrase', TEST_PASSPHRASE)
    await t.waitAndClick('#login-btn')
    await t.waitForNav()

    const rowExists = await t.exists('.email-row')
    if (!rowExists) {
      t.pass() // nothing in the inbox to click through yet - not a failure
      return
    }

    await t.waitAndClick('.email-row')
    await t.waitForNav()
    t.ok(await t.exists('.message'), 'expected the message view to render')
    t.ok(await t.exists('.back'), 'expected a back-to-inbox link')

    await t.waitAndClick('.back')
    await t.waitForNav()
    t.ok(t.url().includes('/dashboard'), 'expected to return to /dashboard')
  })
}
