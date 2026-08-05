#!/usr/bin/env node
// Trazer CLI — wraps the root npm scripts and exposes API + dev sub-commands.
// Long-running commands (dev:*) belong in a sub-agent per AGENTS.md.
import { spawn, exec } from 'node:child_process'
import { existsSync, writeFileSync, readFileSync, unlinkSync, openSync } from 'node:fs'
import { promisify } from 'node:util'
import { platform, tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'
import net from 'node:net'
import path from 'node:path'

const execAsync = promisify(exec)
const isWindows = platform() === 'win32'
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// ponytail: PID file lets dev.stop kill the specific processes we spawned
// (no false positives on unrelated "taskboard" matches). The broad kill
// stays as a safety net for the case where the pid file is missing.
const pidFile = path.join(tmpdir(), 'trazer-dev.pids')

const API = process.env.TRAZER_API ?? 'http://localhost:8080'
const TOKEN = process.env.TRAZER_TOKEN ?? null

async function api(method, path, body, fetchImpl = fetch) {
  const headers = { 'Content-Type': 'application/json' }
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`
  const res = await fetchImpl(`${API}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) {
    let msg = await res.text()
    try { msg = JSON.parse(msg).error?.message ?? msg } catch { /* keep raw */ }
    throw new Error(`${method} ${path} → ${res.status}: ${msg}`)
  }
  if (res.status === 204) return null
  return res.json()
}

const parseFlags = (args) => {
  const out = {}
  for (const a of args) {
    const m = a.match(/^--(\w+)=(.+)$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}

const runNpm = (script, args) => new Promise((resolve, reject) => {
  const proc = spawn('npm', ['run', script, ...args.filter(Boolean)], { stdio: 'inherit' })
  proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`npm run ${script} exited ${code}`))))
})

async function waitFor(url, maxAttempts = 60, intervalMs = 3000) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) })
      if (res.ok) return true
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return false
}

async function killTaskboardProcesses() {
  // ponytail: only kill dotnet + node whose path or command line mentions
  // the repo, so we never touch an unrelated process the user has running.
  try {
    if (isWindows) {
      const ps = `powershell -NoProfile -Command "Get-Process -ErrorAction SilentlyContinue | Where-Object { (($_.Path -and $_.Path -match 'taskboard') -or ($_.CommandLine -and $_.CommandLine -match 'taskboard')) -and ($_.ProcessName -eq 'dotnet' -or $_.ProcessName -eq 'node') } | Stop-Process -Force"`
      await execAsync(ps, { windowsHide: true })
    } else {
      await execAsync(`pkill -9 -f taskboard`).catch(() => {})
    }
  } catch { /* nothing to kill is fine */ }
}

// ponytail: prompt only in a TTY. In CI/automation (no TTY) the env
// var wins, then the default. Keeps `echo y | trazer dev` working
// without hanging on stdin.
async function prompt(question, defaultValue) {
  if (!process.stdin.isTTY) return defaultValue
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    rl.question(`${question} (default: ${defaultValue}): `, (answer) => {
      rl.close()
      resolve(answer.trim() || defaultValue)
    })
  })
}

// ponytail: hidden password prompt. Raw mode + '*' per char. Returns null
// when stdin isn't a TTY so the caller can fall back to the env var or
// the manual setup instructions.
async function promptPassword(question) {
  if (!process.stdin.isTTY) return null
  process.stdout.write(question)
  const stdin = process.stdin
  const wasRaw = stdin.isRaw
  try { stdin.setRawMode(true) } catch { return null }
  stdin.resume()
  stdin.setEncoding('utf8')
  return new Promise((resolve) => {
    let input = ''
    const onData = (ch) => {
      const c = ch.charCodeAt(0)
      if (c === 0x03) {
        process.stdout.write('\n')
        stdin.removeListener('data', onData)
        try { stdin.setRawMode(wasRaw) } catch { /* noop */ }
        stdin.pause()
        process.exit(130)
      }
      if (c === 0x0d || c === 0x0a) {
        process.stdout.write('\n')
        stdin.removeListener('data', onData)
        try { stdin.setRawMode(wasRaw) } catch { /* noop */ }
        stdin.pause()
        resolve(input)
        return
      }
      if (c === 0x08 || c === 0x7f) {
        if (input.length > 0) { input = input.slice(0, -1); process.stdout.write('\b \b') }
        return
      }
      if (c < 0x20) return
      input += ch
      process.stdout.write('*')
    }
    stdin.on('data', onData)
  })
}

// ponytail: pure-Node TCP probe to localhost:5432 — no deps, no psql
// needed for the first check. If Postgres is listening, also try a
// psql connection to the trazer user/db so we catch "Postgres is up
// but the user/db is missing" before the API dies on first migration.
async function checkPostgres() {
  const tcpOk = await new Promise((resolve) => {
    const sock = new net.Socket()
    sock.setTimeout(2000)
    sock.once('connect', () => { sock.destroy(); resolve(true) })
    sock.once('timeout', () => { sock.destroy(); resolve(false) })
    sock.once('error', () => resolve(false))
    sock.connect(5432, 'localhost')
  })
  if (!tcpOk) return { ok: false, reason: 'not listening' }
  const psql = await findPsql()
  if (!psql) return { ok: false, reason: 'no psql' }
  const psqlOk = await new Promise((resolve) => {
    const useShell = !psql.includes('\\')
    const proc = spawn(psql, ['-h', 'localhost', '-U', 'trazer', '-d', 'trazer', '-c', 'SELECT 1'], {
      stdio: 'pipe', shell: useShell, windowsHide: true,
    })
    proc.once('exit', (code) => resolve(code === 0))
    proc.once('error', () => resolve(false))
  })
  if (!psqlOk) return { ok: false, reason: 'no user/db' }
  return { ok: true }
}

// ponytail: find psql the same way setup-postgres.bat does — try PATH,
// then on Windows fall back to the default install dirs (versions 14-17).
// Returns the executable (just 'psql' if found in PATH, or an absolute
// path), or null if nothing is found.
async function findPsql() {
  const inPath = await new Promise((resolve) => {
    const proc = spawn('psql', ['--version'], { stdio: 'pipe', shell: true, windowsHide: true })
    proc.once('exit', (code) => resolve(code === 0))
    proc.once('error', () => resolve(false))
  })
  if (inPath) return 'psql'
  if (!isWindows) return null
  // Default install dirs — newest first so a fresh install wins.
  const candidates = [
    'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe',
    'C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe',
    'C:\\Program Files\\PostgreSQL\\15\\bin\\psql.exe',
    'C:\\Program Files\\PostgreSQL\\14\\bin\\psql.exe',
    'C:\\Program Files (x86)\\PostgreSQL\\17\\bin\\psql.exe',
    'C:\\Program Files (x86)\\PostgreSQL\\16\\bin\\psql.exe',
  ]
  for (const p of candidates) if (existsSync(p)) return p
  return null
}

// ponytail: spawn psql as the postgres superuser and run SQL from stdin.
// Resolves on exit 0, rejects with stderr on failure. Honors PGPASSWORD
// from the caller so trust auth and password auth both work.
async function runPsql(superuser, password, sql) {
  const psql = await findPsql()
  if (!psql) throw new Error('psql not found. Add C:\\Program Files\\PostgreSQL\\<ver>\\bin to PATH or run scripts/setup-postgres.bat.')
  const env = { ...process.env }
  if (password) env.PGPASSWORD = password
  return new Promise((resolve, reject) => {
    // ponytail: when psql is a full path (Windows fallback), spawn it
    // directly without the shell so spaces in 'C:\Program Files\…' don't
    // need quoting. When it's the bare 'psql', let the shell resolve PATH.
    const useShell = !psql.includes('\\')
    const proc = spawn(
      psql,
      ['-h', 'localhost', '-U', superuser, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', '-'],
      { stdio: ['pipe', 'pipe', 'pipe'], env, shell: useShell, windowsHide: true },
    )
    let stderr = ''
    proc.stderr.on('data', (d) => { stderr += d.toString() })
    proc.once('error', reject)
    proc.once('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || `psql exited ${code}`))
    })
    proc.stdin.write(sql)
    proc.stdin.end()
  })
}

// ponytail: idempotent CREATE USER + CREATE DATABASE for the trazer role.
// Tries trust auth first (works on default Windows + many local configs),
// then prompts for the postgres superuser password, then bails. The SQL
// uses DO blocks + \gexec so re-running is a no-op.
async function createTrazerDb() {
  const sql = [
    `DO $$ BEGIN`,
    `  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'trazer') THEN`,
    `    CREATE USER trazer WITH PASSWORD 'trazer';`,
    `  END IF;`,
    `END $$;`,
    `SELECT 'CREATE DATABASE trazer OWNER trazer'`,
    `WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'trazer')`,
    `\gexec`,
  ].join('\n')

  // 1) Trust auth (PGPASSWORD unset, works on local trust/peer setups)
  try {
    await runPsql('postgres', undefined, sql)
    return true
  } catch (e) {
    const msg = e.message ?? ''
    const recoverable = /password|authentication|peer|role|permission/i.test(msg)
    if (!recoverable) {
      console.error(`could not run psql: ${msg || 'unknown error'}`)
      return false
    }
  }

  // 2) Prompt for the postgres superuser password
  if (process.env.PG_SUPERUSER_PASSWORD) {
    try {
      await runPsql('postgres', process.env.PG_SUPERUSER_PASSWORD, sql)
      return true
    } catch (e) {
      console.error(`psql with PG_SUPERUSER_PASSWORD failed: ${e.message}`)
      return false
    }
  }
  const password = await promptPassword('Postgres superuser (postgres) password (Ctrl+C to abort): ')
  if (password == null) {
    console.error('no TTY available for the password prompt; set PG_SUPERUSER_PASSWORD or run the CREATE USER/CREATE DATABASE statements manually.')
    return false
  }
  try {
    await runPsql('postgres', password, sql)
    return true
  } catch (e) {
    console.error(`psql failed: ${e.message}`)
    return false
  }
}

const dev = {
  native: async () => {
    const apiPort = process.env.TRAZER_API_PORT || await prompt('API port', '8080')
    const webPort = process.env.TRAZER_WEB_PORT || await prompt('Web port', '5173')
    const env = {
      ...process.env,
      ConnectionStrings__Default: 'Host=localhost;Database=trazer;Username=trazer;Password=trazer',
      Jwt__Key: 'dev-only-secret-change-in-production',
      ASPNETCORE_URLS: `http://localhost:${apiPort}`,
      ASPNETCORE_ENVIRONMENT: 'Development',
      Demo__Enabled: 'true',
      // vite.config.ts reads this for the /api proxy target — keeps the
      // web in sync if the API port changes.
      API_PROXY_TARGET: `http://localhost:${apiPort}`,
    }
    // ponytail: a fresh clone has no apps/web/node_modules; install before spawning vite.
    if (!existsSync(path.join(REPO, 'apps/web/node_modules'))) {
      console.log('apps/web/node_modules missing — running npm install...')
      await execAsync('npm install', { cwd: path.join(REPO, 'apps/web') })
    }
    const pg = await checkPostgres()
    if (!pg.ok) {
      if (pg.reason === 'not listening') {
        console.error('Postgres not reachable on localhost:5432. Install it, start it, then re-run this command.')
        process.exit(1)
      }
      // 'no user/db' — try to set them up as the postgres superuser.
      console.log('Postgres is up but the trazer user/db is missing. Setting them up as the postgres superuser…')
      // On Windows, also point at the explicit .bat so the user can run it
      // manually if they'd rather not type the password into a Node prompt.
      if (isWindows && existsSync(path.join(REPO, 'scripts', 'setup-postgres.bat'))) {
        console.log(`  (on Windows you can also run: ${path.join(REPO, 'scripts', 'setup-postgres.bat')})`)
      }
      const created = await createTrazerDb()
      if (!created) {
        console.error('Could not create the trazer user/db automatically. Run these as the postgres superuser:')
        console.error('  CREATE USER trazer WITH PASSWORD \'trazer\';')
        console.error('  CREATE DATABASE trazer OWNER trazer;')
        process.exit(1)
      }
      console.log('✓ created trazer user and database.')
      const pg2 = await checkPostgres()
      if (!pg2.ok) {
        console.error('Postgres is reachable but the trazer user/db is still not connectable. Check pg_hba.conf.')
        process.exit(1)
      }
    }
    console.log('starting dev stack (native, Postgres on :5432 assumed)...')
    await killTaskboardProcesses()
    const apiLogPath = path.join(tmpdir(), 'trazer-api.log')
    const webLogPath = path.join(tmpdir(), 'trazer-web.log')
    const apiLogFd = openSync(apiLogPath, 'w')
    const webLogFd = openSync(webLogPath, 'w')
    const api = spawn('dotnet', ['run', '--project', 'apps/api', '--no-launch-profile'], {
      cwd: REPO, env, detached: true, stdio: ['ignore', apiLogFd, apiLogFd], windowsHide: true,
    })
    api.unref()
    const web = spawn('npm', ['run', 'dev', '--', '--port', webPort], {
      cwd: path.join(REPO, 'apps/web'), env, detached: true, stdio: ['ignore', webLogFd, webLogFd],
      shell: isWindows, windowsHide: true,
    })
    web.unref()
    // ponytail: surface child crashes with the log path so the user can
    // post-mortem read what went wrong. detached: true means the parent
    // can exit while children run, so the listeners are best-effort.
    api.on('exit', (code, signal) => {
      if (code !== 0 && code !== null) console.error(`[dev] API process exited (code ${code}). Tail of ${apiLogPath}:`)
    })
    web.on('exit', (code, signal) => {
      if (code !== 0 && code !== null) console.error(`[dev] Web process exited (code ${code}). Tail of ${webLogPath}:`)
    })
    // Save PIDs so dev.stop can kill exactly these processes
    writeFileSync(pidFile, `${api.pid}\n${web.pid}\n`)
    const apiOk = await waitFor(`http://localhost:${apiPort}/api/health`)
    const webOk = await waitFor(`http://localhost:${webPort}`)
    if (apiOk && webOk) {
      console.log('dev stack up (native)')
      console.log(`  api:  http://localhost:${apiPort}`)
      console.log(`  web:  http://localhost:${webPort}`)
      console.log('  login: demo@trazer.dev / password123')
      console.log('  stop: trazer dev stop')
      console.log(`  api log: ${apiLogPath}`)
      console.log(`  web log: ${webLogPath}`)
    } else {
      console.error('dev stack failed to come up')
      console.error(`  api: ${apiOk ? 'up' : 'down'}`)
      console.error(`  web: ${webOk ? 'up' : 'down'}`)
      console.error(`  tail api log: ${apiLogPath}`)
      console.error(`  tail web log: ${webLogPath}`)
      process.exit(1)
    }
  },
  docker: async () => {
    console.log('starting dev stack (docker compose)...')
    await killTaskboardProcesses()
    await execAsync('docker compose up -d', { cwd: REPO })
    const apiOk = await waitFor('http://localhost:8080/api/health')
    const webOk = await waitFor('http://localhost:3000')
    if (apiOk && webOk) {
      console.log('docker stack up')
      console.log('  api:  http://localhost:8080')
      console.log('  web:  http://localhost:3000')
      console.log('  stop: trazer dev stop')
    } else {
      console.error('docker stack failed to come up')
      process.exit(1)
    }
  },
  stop: async () => {
    console.log('stopping dev stack...')
    // Kill the specific PIDs we spawned at dev start (clean, no false positives)
    try {
      const content = readFileSync(pidFile, 'utf8')
      const pids = content.split('\n').map((s) => parseInt(s, 10)).filter((n) => Number.isFinite(n) && n > 0)
      for (const pid of pids) {
        try { process.kill(pid) } catch { /* already dead */ }
      }
      try { unlinkSync(pidFile) } catch { /* already gone */ }
    } catch { /* no pid file — fall through to broad kill */ }
    // Broad kill as a safety net (handles stale processes from a previous
    // dev start that crashed before writing the pid file, or non-dev tasks
    // that happen to be on the dev ports)
    await killTaskboardProcesses()
    try {
      await execAsync('docker compose down', { cwd: REPO })
    } catch { /* no docker compose is fine */ }
    console.log('done')
  },
}

const issue = {
  list: async (projectKey) => {
    if (!projectKey) throw new Error('project key required')
    const items = await api('GET', `/api/projects/${projectKey}/issues`)
    for (const i of items) console.log(`${i.key}\t${i.status.padEnd(10)}\t${i.priority.padEnd(7)}\t${i.title}`)
  },
  get: async (key) => {
    if (!key) throw new Error('issue key required (e.g. GAME-1)')
    const i = await api('GET', `/api/issues/${key}`)
    console.log(JSON.stringify(i, null, 2))
  },
  create: async (projectKey, ...words) => {
    const title = words.join(' ')
    if (!projectKey || !title) throw new Error('usage: issue create <project> <title>')
    const i = await api('POST', `/api/projects/${projectKey}/issues`, { title, type: 'Task' })
    console.log(`created ${i.key}: ${i.title}`)
  },
  update: async (key, ...flags) => {
    if (!key) throw new Error('issue key required')
    const patch = parseFlags(flags)
    if (!Object.keys(patch).length) throw new Error('at least one --field=value required')
    const i = await api('PATCH', `/api/issues/${key}`, patch)
    console.log(`updated ${i.key}: ${JSON.stringify(patch)}`)
  },
  comment: async (key, ...words) => {
    const body = words.join(' ')
    if (!key || !body) throw new Error('usage: issue comment <key> <body>')
    const [project, number] = key.split('-')
    if (!project || !number) throw new Error('issue key must be PROJECT-NUMBER (e.g. GAME-1)')
    const c = await api('POST', `/api/projects/${project}/issues/${number}/comments`, { body })
    console.log(`commented on ${key}: comment ${c.id}`)
  },
}

const user = {
  me: async () => {
    const me = await api('GET', '/api/auth/me')
    console.log(JSON.stringify(me, null, 2))
  },
  create: async (...args) => {
    const flags = parseFlags(args)
    if (!flags.email || !flags.name || !flags.password) {
      throw new Error('usage: user create --email=<email> --name=<name> --password=<password> [--admin]')
    }
    const body = { email: flags.email, name: flags.name, password: flags.password }
    // --admin (bare) or --admin=true/1/yes/on sets isAdmin; --admin=false or absent leaves it false.
    if (args.includes('--admin') || ['true', '1', 'yes', 'on'].includes(String(flags.admin).toLowerCase())) {
      body.isAdmin = true
    }
    const r = await api('POST', '/api/auth/users', body)
    console.log(`created user ${r.email}${r.isAdmin ? ' (admin)' : ''}`)
  },
  resetPassword: async (...args) => {
    const flags = parseFlags(args)
    if (!flags.email || !flags.password) {
      throw new Error('usage: user reset-password --email=<email> --password=<newpassword>')
    }
    const users = await api('GET', '/api/auth/users')
    const u = users.find(x => x.email === flags.email)
    if (!u) throw new Error(`user not found: ${flags.email}`)
    await api('PATCH', `/api/auth/users/${u.id}`, { password: flags.password })
    console.log(`reset password for ${flags.email}`)
  },
}

const config = {
  show: async () => {
    const c = await api('GET', '/api/config')
    console.log(JSON.stringify(c, null, 2))
  },
}

const admin = {
  create: async (...args) => {
    const flags = parseFlags(args)
    if (!flags.email || !flags.password) throw new Error('usage: admin create --email=<email> --password=<password> [--name=<name>]')
    const r = await api('POST', '/api/auth/admin', {
      email: flags.email,
      name: flags.name,
      password: flags.password,
    })
    console.log(`created admin ${r.user.email}`)
    console.log(`token: ${r.token}`)
  },
}

const help = `trazer — Trazer CLI

Usage: trazer <command> [args]

Build & test (npm scripts):
  build         build api + web
  build:api     dotnet publish api
  build:web     tsc + vite build web
  test          dotnet tests + tsc + vite build
  test:api      dotnet test
  test:web      tsc + vite build

Cleanup:
  clean         remove build artifacts
  clean:git     git reflog expire + gc

Dev (long-running — sub-agent preferred per AGENTS.md, but CLI works):
  dev            start the dev stack (native, prompts for API + web ports)
  dev native     same as 'dev'
  dev docker     docker compose up -d (api on :8080, web on :3000)
  dev stop       kill dev processes + docker compose down

Dev ports (native only — set as env vars to skip the prompt):
  TRAZER_API_PORT  API port (default 8080)
  TRAZER_WEB_PORT  web port (default 5173)

API (talks to $TRAZER_API, default http://localhost:8080; needs $TRAZER_TOKEN):
  issue list <project>             list issues
  issue get <key>                  show one issue
  issue create <project> <title>   create an issue (type=Task default)
  issue update <key> [flags]       update (--status, --priority, --assignee=<id>, --title, --description)
  issue comment <key> <body>       add a comment
  user me                          current user
  user create --email=<email> --name=<name> --password=<password> [--admin]
                                  create a new user (requires admin token)
  user reset-password --email=<email> --password=<newpassword>
                                  reset a user's password (requires admin token)
  config show                      public config (demo flag, etc.)
  admin create --email=<email> --password=<password> [--name=<name>]
                                  bootstrap the first admin (works only when Users is empty)

Env:
  TRAZER_API    API base URL
  TRAZER_TOKEN  JWT or API token (Bearer auth)
`

// ponytail: export the testable internals so scripts/trazer.test.mjs can
// unit-test them without going through the CLI subprocess.
export { parseFlags, api, runNpm, waitFor, killTaskboardProcesses, prompt, promptPassword, checkPostgres, findPsql, runPsql, createTrazerDb }

// Run the CLI dispatcher only when this file is invoked directly — not
// when it's imported by the test runner (or anything else).
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  const [, , cmd, sub, ...rest] = process.argv

  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    console.log(help)
    process.exit(0)
  }

  const handlers = { issue, user, config, admin, dev }
  if (handlers[cmd]) {
    // 'dev' defaults to 'native' when no subcommand given
    const fn = (cmd === 'dev' && !sub) ? handlers.dev.native : handlers[cmd][sub]
    if (!fn) {
      console.error(`unknown ${cmd} subcommand: ${sub ?? '(none)'}`)
      process.exit(1)
    }
    fn(...rest).catch((err) => { console.error(err.message); process.exit(1) })
  } else {
    runNpm(cmd, [sub, ...rest]).catch((err) => { console.error(err.message); process.exit(1) })
  }
}
