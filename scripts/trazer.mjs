#!/usr/bin/env node
// Trazer CLI — wraps the root npm scripts and exposes API + dev sub-commands.
// Long-running commands (dev:*) belong in a sub-agent per AGENTS.md.
import { spawn, exec } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'
import { platform } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'
import path from 'node:path'

const execAsync = promisify(exec)
const isWindows = platform() === 'win32'
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const API = process.env.TRAZER_API ?? 'http://localhost:8080'
const TOKEN = process.env.TRAZER_TOKEN ?? null

async function api(method, path, body) {
  const headers = { 'Content-Type': 'application/json' }
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`
  const res = await fetch(`${API}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
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
    console.log('starting dev stack (native, assumes Postgres running on :5432)...')
    await killTaskboardProcesses()
    const api = spawn('dotnet', ['run', '--project', 'apps/api', '--no-launch-profile'], {
      cwd: REPO, env, detached: true, stdio: 'ignore', windowsHide: true,
    })
    api.unref()
    const web = spawn('npm', ['run', 'dev', '--', '--port', webPort], {
      cwd: path.join(REPO, 'apps/web'), env, detached: true, stdio: 'ignore',
      shell: isWindows, windowsHide: true,
    })
    web.unref()
    const apiOk = await waitFor(`http://localhost:${apiPort}/api/health`)
    const webOk = await waitFor(`http://localhost:${webPort}`)
    if (apiOk && webOk) {
      console.log('dev stack up (native)')
      console.log(`  api:  http://localhost:${apiPort}`)
      console.log(`  web:  http://localhost:${webPort}`)
      console.log('  login: demo@trazer.dev / password123')
      console.log('  stop: trazer dev stop')
    } else {
      console.error('dev stack failed to come up')
      console.error(`  api: ${apiOk ? 'up' : 'down'}`)
      console.error(`  web: ${webOk ? 'up' : 'down'}`)
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
  config show                      public config (demo flag, etc.)
  admin create --email=<email> --password=<password> [--name=<name>]
                                  bootstrap the first admin (works only when Users is empty)

Env:
  TRAZER_API    API base URL
  TRAZER_TOKEN  JWT or API token (Bearer auth)
`

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
