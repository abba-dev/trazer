#!/usr/bin/env node
// Trazer CLI — thin wrapper for the root npm scripts.
// Long-running commands (dev:*) belong in a sub-agent per AGENTS.md.
import { spawn } from 'node:child_process'

const [, , cmd, ...rest] = process.argv

const help = `trazer — Trazer CLI

Usage: trazer <command> [args]

Build & test:
  build         build api + web
  build:api     dotnet publish api
  build:web     tsc + vite build web
  test          dotnet tests + tsc + vite build
  test:api      dotnet test
  test:web      tsc + vite build

Cleanup:
  clean         remove build artifacts (bin, obj, dist, node_modules)
  clean:git     git reflog expire + gc

Dev (long-running — delegate to a sub-agent per AGENTS.md):
  dev:api       run api
  dev:web       run vite

Anything else is delegated to \`npm run <script>\`.
`

function run(command, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: 'inherit' })
    proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`))))
  })
}

if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
  console.log(help)
  process.exit(0)
}

run('npm', ['run', cmd, ...rest]).catch((err) => {
  console.error(err.message)
  process.exit(1)
})
