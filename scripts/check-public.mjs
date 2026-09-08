// Blocks the repository from shipping host-only paths or credentials.
// Run via `npm run check:public` (also invoked in CI).
import { readdirSync, readFileSync } from 'node:fs'
import { statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const FORBIDDEN = [
  /\/home\/ubuntu\//,
  /\/tmp\/dsh-web\//,
  /deepseek-harness/,
  /dsh-harness/,
  /dev_scaffold_plugin/,
  /dev_inject_plugin/,
]

const ROOT = fileURLToPath(new URL('..', import.meta.url))

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === '.git') continue
      yield* walk(full)
    } else if (/\.(ts|tsx|js|mjs|json|md|sh|yml|yaml)$/.test(entry) && !full.endsWith('check-public.mjs')) {
      yield full
    }
  }
}

let failed = false
for (const file of walk(ROOT)) {
  const text = readFileSync(file, 'utf8')
  for (const pattern of FORBIDDEN) {
    if (pattern.test(text)) {
      console.error(`check:public: ${file} matches ${pattern}`)
      failed = true
    }
  }
}

if (failed) {
  console.error('check:public: FAILED — remove host-only paths/credentials before publishing.')
  process.exit(1)
}
console.log('check:public: OK — no host-only paths/credentials found.')
