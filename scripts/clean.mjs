import { rmSync } from 'node:fs'

const targets = [
  'apps/api/bin',
  'apps/api/obj',
  'apps/api.Tests/bin',
  'apps/api.Tests/obj',
  'apps/web/dist',
  'apps/web/node_modules',
]

for (const t of targets) {
  try {
    rmSync(t, { recursive: true, force: true })
    console.log(`removed ${t}`)
  } catch (e) {
    if (e.code !== 'ENOENT') throw e
  }
}
