import { test } from 'node:test'
import assert from 'node:assert/strict'
import { avatarKey, isStorableImage, storeAvatar, cacheAvatars, reconcileAvatars } from '../src/avatars.js'

// Minimal stand-in for the R2 binding: head/get/put over a Map.
function fakeBucket () {
  const objects = new Map()
  return {
    objects,
    async head (key) { return objects.has(key) ? { key } : null },
    async get (key) { return objects.get(key) || null },
    async put (key, body, opts) { objects.set(key, { body, opts }) },
    async delete (keys) { for (const k of [].concat(keys)) objects.delete(k) },
    // paginates at 2, continuing after the last key returned - the way R2's
    // opaque cursor behaves, rather than a numeric offset into a live list
    async list ({ prefix = '', cursor } = {}) {
      const all = [...objects.keys()].filter((k) => k.startsWith(prefix)).sort()
      const rest = cursor ? all.filter((k) => k > cursor) : all
      const page = rest.slice(0, 2)
      const truncated = rest.length > 2
      return {
        objects: page.map((key) => ({ key })),
        truncated,
        cursor: truncated ? page[page.length - 1] : undefined
      }
    }
  }
}

// Swaps globalThis.fetch for the duration of fn, recording every url asked for.
async function withFetch (impl, fn) {
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => { calls.push(String(url)); return impl(String(url), init) }
  try {
    return await fn(calls)
  } finally {
    globalThis.fetch = original
  }
}

const imageResponse = (bytes = 64, type = 'image/jpeg') => new Response(new Uint8Array(bytes), {
  status: 200,
  headers: { 'content-type': type }
})

test('avatarKey: stable, namespaced, and different per url', async () => {
  const a = await avatarKey('https://lh3.googleusercontent.com/abc')
  const b = await avatarKey('https://lh3.googleusercontent.com/abc')
  const c = await avatarKey('https://lh3.googleusercontent.com/xyz')
  assert.equal(a, b)
  assert.notEqual(a, c)
  assert.match(a, /^avatars\/[0-9a-f]{64}$/)
})

test('isStorableImage: images yes, svg and everything else no', () => {
  assert.equal(isStorableImage('image/jpeg'), true)
  assert.equal(isStorableImage('image/png; charset=binary'), true)
  assert.equal(isStorableImage('IMAGE/WEBP'), true)
  // renders as an image, runs script - we serve these from our own origin
  assert.equal(isStorableImage('image/svg+xml'), false)
  assert.equal(isStorableImage('image/svg+xml; charset=utf-8'), false)
  assert.equal(isStorableImage('text/html'), false)
  assert.equal(isStorableImage(''), false)
  assert.equal(isStorableImage(null), false)
})

test('storeAvatar: fetches once and puts the bytes under the url key', async () => {
  const env = { ATTACHMENTS: fakeBucket() }
  const url = 'https://lh3.googleusercontent.com/photo'
  await withFetch(() => imageResponse(), async (calls) => {
    const key = await storeAvatar(env, url)
    assert.equal(key, await avatarKey(url))
    assert.equal(calls.length, 1)
    assert.equal(env.ATTACHMENTS.objects.get(key).opts.httpMetadata.contentType, 'image/jpeg')
  })
})

test('storeAvatar: already in the bucket means no network call', async () => {
  const env = { ATTACHMENTS: fakeBucket() }
  const url = 'https://lh3.googleusercontent.com/photo'
  env.ATTACHMENTS.objects.set(await avatarKey(url), { body: new Uint8Array(1) })
  await withFetch(() => imageResponse(), async (calls) => {
    const key = await storeAvatar(env, url)
    assert.equal(key, await avatarKey(url))
    assert.equal(calls.length, 0)
  })
})

test('storeAvatar: refuses non-images, svg, empty bodies and oversize files', async () => {
  const env = { ATTACHMENTS: fakeBucket() }
  const cases = [
    new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    new Response('<svg/>', { status: 200, headers: { 'content-type': 'image/svg+xml' } }),
    new Response(new Uint8Array(0), { status: 200, headers: { 'content-type': 'image/png' } }),
    imageResponse(600 * 1024),
    new Response('nope', { status: 404, headers: { 'content-type': 'image/png' } })
  ]
  for (const res of cases) {
    await withFetch(() => res, async () => {
      assert.equal(await storeAvatar(env, 'https://example.com/x'), null)
    })
  }
  assert.equal(env.ATTACHMENTS.objects.size, 0)
})

test('storeAvatar: content-length over the cap bails before reading the body', async () => {
  const env = { ATTACHMENTS: fakeBucket() }
  const res = new Response(new Uint8Array(8), {
    status: 200,
    headers: { 'content-type': 'image/jpeg', 'content-length': String(5 * 1024 * 1024) }
  })
  await withFetch(() => res, async () => {
    assert.equal(await storeAvatar(env, 'https://example.com/huge'), null)
  })
  assert.equal(env.ATTACHMENTS.objects.size, 0)
})

test('storeAvatar: a thrown fetch is swallowed, not propagated', async () => {
  const env = { ATTACHMENTS: fakeBucket() }
  await withFetch(() => { throw new Error('dns') }, async () => {
    assert.equal(await storeAvatar(env, 'https://example.com/x'), null)
  })
})

test('storeAvatar: non-http urls are never fetched', async () => {
  const env = { ATTACHMENTS: fakeBucket() }
  await withFetch(() => imageResponse(), async (calls) => {
    assert.equal(await storeAvatar(env, 'data:image/png;base64,AAAA'), null)
    assert.equal(await storeAvatar(env, 'file:///etc/passwd'), null)
    assert.equal(await storeAvatar(env, ''), null)
    assert.equal(calls.length, 0)
  })
})

test('cacheAvatars: dedupes shared photo urls and skips contacts without one', async () => {
  const env = { ATTACHMENTS: fakeBucket() }
  const contacts = [
    { email: 'a@x.com', avatarUrl: 'https://img/1' },
    { email: 'b@x.com', avatarUrl: 'https://img/1' }, // couple sharing a photo
    { email: 'c@x.com', avatarUrl: 'https://img/2' },
    { email: 'd@x.com', avatarUrl: '' },
    { email: 'e@x.com' }
  ]
  await withFetch(() => imageResponse(), async (calls) => {
    assert.equal(await cacheAvatars(env, contacts), 2)
    assert.equal(calls.length, 2)
  })
})

test('cacheAvatars: one bad photo does not sink the rest of the import', async () => {
  const env = { ATTACHMENTS: fakeBucket() }
  const contacts = Array.from({ length: 20 }, (_, i) => ({ avatarUrl: `https://img/${i}` }))
  await withFetch((url) => {
    if (url.endsWith('/7')) throw new Error('boom')
    if (url.endsWith('/9')) return new Response('x', { status: 500 })
    return imageResponse()
  }, async () => {
    assert.equal(await cacheAvatars(env, contacts), 18)
  })
  assert.equal(env.ATTACHMENTS.objects.size, 18)
})

test('cacheAvatars: empty list does no work', async () => {
  const env = { ATTACHMENTS: fakeBucket() }
  await withFetch(() => imageResponse(), async (calls) => {
    assert.equal(await cacheAvatars(env, []), 0)
    assert.equal(await cacheAvatars(env, undefined), 0)
    assert.equal(calls.length, 0)
  })
})

test('reconcileAvatars: keeps what is still pointed at, drops the rest', async () => {
  const env = { ATTACHMENTS: fakeBucket() }
  const live = ['https://img/1', 'https://img/2']
  const dead = ['https://img/old-a', 'https://img/old-b', 'https://img/old-c']
  for (const u of [...live, ...dead]) env.ATTACHMENTS.objects.set(await avatarKey(u), { body: 1 })
  // an unrelated attachment must survive - avatars share the bucket
  env.ATTACHMENTS.objects.set('attachments/some-file', { body: 1 })

  assert.equal(await reconcileAvatars(env, live), 3)
  assert.equal(env.ATTACHMENTS.objects.size, 3)
  for (const u of live) assert.ok(env.ATTACHMENTS.objects.has(await avatarKey(u)))
  assert.ok(env.ATTACHMENTS.objects.has('attachments/some-file'))
})

test('reconcileAvatars: empty wanted set clears the whole prefix', async () => {
  const env = { ATTACHMENTS: fakeBucket() }
  for (const u of ['https://img/1', 'https://img/2', 'https://img/3']) {
    env.ATTACHMENTS.objects.set(await avatarKey(u), { body: 1 })
  }
  env.ATTACHMENTS.objects.set('attachments/keep-me', { body: 1 })

  assert.equal(await reconcileAvatars(env, []), 3)
  assert.deepEqual([...env.ATTACHMENTS.objects.keys()], ['attachments/keep-me'])
})

test('reconcileAvatars: nothing to do is not an error', async () => {
  const env = { ATTACHMENTS: fakeBucket() }
  assert.equal(await reconcileAvatars(env, ['https://img/1']), 0)
  assert.equal(await reconcileAvatars(env, undefined), 0)
})

test('reconcileAvatars: a duplicated url is still one wanted key', async () => {
  const env = { ATTACHMENTS: fakeBucket() }
  env.ATTACHMENTS.objects.set(await avatarKey('https://img/1'), { body: 1 })
  assert.equal(await reconcileAvatars(env, ['https://img/1', 'https://img/1', '']), 0)
  assert.equal(env.ATTACHMENTS.objects.size, 1)
})

test('import order: cache then sweep leaves the freshly fetched photo alone', async () => {
  const env = { ATTACHMENTS: fakeBucket() }
  const contacts = [{ avatarUrl: 'https://img/new' }]
  env.ATTACHMENTS.objects.set(await avatarKey('https://img/stale'), { body: 1 })

  await withFetch(() => imageResponse(), async () => {
    await cacheAvatars(env, contacts)
    await reconcileAvatars(env, contacts.map((c) => c.avatarUrl))
  })
  assert.deepEqual([...env.ATTACHMENTS.objects.keys()], [await avatarKey('https://img/new')])
})
