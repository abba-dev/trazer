#!/usr/bin/env node
// Trazer CLI — wraps the root npm scripts and exposes API sub-commands.
// Long-running commands (dev:*) belong in a sub-agent per AGENTS.md.
import { spawn } from 'node:child_process'

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
}

const config = {
  show: async () => {
    const c = await api('GET', '/api/config')
    console.log(JSON.stringify(c, null, 2))
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

Dev (long-running — sub-agent per AGENTS.md):
  dev:api       run api
  dev:web       run vite

API (talks to $TRAZER_API, default http://localhost:8080; needs $TRAZER_TOKEN):
  issue list <project>             list issues
  issue get <key>                  show one issue
  issue create <project> <title>   create an issue (type=Task default)
  issue update <key> [flags]       update (--status, --priority, --assignee=<id>, --title, --description)
  issue comment <key> <body>       add a comment
  user me                          current user
  config show                      public config (demo flag, etc.)

Env:
  TRAZER_API    API base URL
  TRAZER_TOKEN  JWT or API token (Bearer auth)
`

const [, , cmd, sub, ...rest] = process.argv

if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
  console.log(help)
  process.exit(0)
}

const handlers = { issue, user, config }
if (handlers[cmd]) {
  const fn = handlers[cmd][sub]
  if (!fn) {
    console.error(`unknown ${cmd} subcommand: ${sub ?? '(none)'}`)
    process.exit(1)
  }
  fn(...rest).catch((err) => { console.error(err.message); process.exit(1) })
} else {
  runNpm(cmd, [sub, ...rest]).catch((err) => { console.error(err.message); process.exit(1) })
}
