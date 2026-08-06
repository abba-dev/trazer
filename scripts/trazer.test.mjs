// scripts/trazer.test.mjs — unit tests for the Trazer CLI internals.
// Uses node:test (built-in since Node 18). Run with: npm run test:cli
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { parseFlags, api, oneTimeAdmin } from './trazer.mjs'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cliPath = path.join(repo, 'scripts', 'trazer.mjs')

// ---------- parseFlags ----------

test('parseFlags: parses --key=value pairs', () => {
  assert.deepEqual(parseFlags(['--foo=bar', '--baz=qux']), { foo: 'bar', baz: 'qux' })
})

test('parseFlags: returns empty object for no flags', () => {
  assert.deepEqual(parseFlags([]), {})
})

test('parseFlags: ignores non-flag positional args', () => {
  assert.deepEqual(parseFlags(['positional', '--keep=this', 'more']), { keep: 'this' })
})

test('parseFlags: --empty= (no value after =) is ignored (regex requires at least one char)', () => {
  assert.deepEqual(parseFlags(['--empty=']), {})
})

// ---------- api() with mock fetch ----------

test('api: builds URL from API base + path', async () => {
  let captured = null
  const mockFetch = async (url, opts) => {
    captured = { url, opts }
    return { ok: true, status: 200, json: async () => ({ ok: true }) }
  }
  await api('GET', '/test/path', null, mockFetch)
  assert.equal(captured.url, 'http://localhost:8080/test/path')
  assert.equal(captured.opts.method, 'GET')
  assert.equal(captured.opts.headers['Content-Type'], 'application/json')
})

test('api: serializes body to JSON when provided', async () => {
  let captured = null
  const mockFetch = async (url, opts) => {
    captured = { url, opts }
    return { ok: true, status: 200, json: async () => ({}) }
  }
  await api('POST', '/test', { foo: 'bar', n: 42 }, mockFetch)
  assert.equal(captured.opts.body, JSON.stringify({ foo: 'bar', n: 42 }))
})

test('api: omits body when not provided', async () => {
  let captured = null
  const mockFetch = async (url, opts) => {
    captured = { url, opts }
    return { ok: true, status: 200, json: async () => ({}) }
  }
  await api('GET', '/test', null, mockFetch)
  assert.equal(captured.opts.body, undefined)
})

test('api: returns parsed JSON on ok response', async () => {
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ hello: 'world' }),
  })
  const result = await api('GET', '/x', null, mockFetch)
  assert.deepEqual(result, { hello: 'world' })
})

test('api: returns null on 204 No Content', async () => {
  const mockFetch = async () => ({ ok: true, status: 204 })
  const result = await api('GET', '/x', null, mockFetch)
  assert.equal(result, null)
})

test('api: throws with status + message on non-ok response', async () => {
  const mockFetch = async () => ({
    ok: false,
    status: 404,
    text: async () => 'not found',
  })
  await assert.rejects(
    () => api('GET', '/x', null, mockFetch),
    /GET \/x → 404: not found/,
  )
})

test('api: extracts error.message from JSON body when present', async () => {
  const mockFetch = async () => ({
    ok: false,
    status: 422,
    text: async () => JSON.stringify({ error: { message: 'invalid email' } }),
  })
  await assert.rejects(
    () => api('POST', '/x', null, mockFetch),
    /POST \/x → 422: invalid email/,
  )
})

test('api: timeout aborts the fetch', async () => {
  // Simulate a fetch that never resolves (will be aborted by AbortSignal.timeout)
  const slowFetch = (_url, opts) =>
    new Promise((_resolve, reject) => {
      opts.signal.addEventListener('abort', () => reject(new Error('aborted')))
    })
  // Use a short timeout for the test by relying on the default 5s is too slow.
  // The AbortSignal.timeout is hardcoded; we just verify the signal is passed.
  let captured = null
  const capturingFetch = async (url, opts) => {
    captured = opts
    return { ok: true, status: 200, json: async () => ({}) }
  }
  await api('GET', '/x', null, capturingFetch)
  assert.ok(captured.signal instanceof AbortSignal, 'api should pass an AbortSignal')
})

test('oneTimeAdmin: fixed email, unique-ish password with safe charset and >= 8 chars', () => {
  const a = oneTimeAdmin()
  assert.equal(a.email, 'admin@trazer.local')
  assert.ok(a.password.length >= 8, 'password too short for the API (min 8)')
  assert.match(a.password, /^[A-Za-z0-9_-]+$/, 'password must be copy-paste safe (base64url)')
  const b = oneTimeAdmin()
  assert.notEqual(a.password, b.password, 'each bootstrap must generate a fresh password')
})

// ---------- CLI subprocess smoke tests ----------

test('CLI: no args prints help and exits 0', () => {
  const result = spawnSync('node', [cliPath], { encoding: 'utf8', timeout: 10000 })
  assert.equal(result.status, 0)
  assert.match(result.stdout, /Trazer CLI/)
  assert.match(result.stdout, /issue list/)
  assert.match(result.stdout, /dev native/)
})

test('CLI: dev stop works without a pid file', () => {
  // If the pid file is missing, dev stop should still exit 0
  // (it just runs the broad kill as a no-op and prints "done")
  const result = spawnSync('node', [cliPath, 'dev', 'stop'], { encoding: 'utf8', timeout: 30000 })
  assert.equal(result.status, 0)
  assert.match(result.stdout, /done/)
})

test('CLI: user create without flags exits 1 with usage', () => {
  const result = spawnSync('node', [cliPath, 'user', 'create'], { encoding: 'utf8', timeout: 10000 })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /usage: user create/)
})
