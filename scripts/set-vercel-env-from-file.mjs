// Set a Vercel production env var from a file, with exact bytes.
//
// Reads the value from a file rather than argv so secrets never appear in a
// shell command or in git. Writes with spawnSync stdin — a PowerShell-piped
// value once appended a newline and failed a production build, because
// Vercel rejects leading/trailing whitespace in env values.
//
// Usage: node scripts/set-vercel-env-from-file.mjs <NAME> <path-to-value-file>
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

const [name, file] = process.argv.slice(2)
if (!name || !file) {
  console.error('Usage: node scripts/set-vercel-env-from-file.mjs <NAME> <path-to-value-file>')
  process.exit(1)
}
const value = fs.readFileSync(file, 'utf8').trim()
if (!value) {
  console.error('Value file is empty')
  process.exit(1)
}

// Mirror into .env.local so local runs match production.
let env = fs.readFileSync('.env.local', 'utf8').replace(/\r\n/g, '\n')
const re = new RegExp(`^${name}=.*$`, 'm')
env = re.test(env)
  ? env.replace(re, `${name}=${value}`)
  : env.replace(/\n*$/, '\n') + `${name}=${value}\n`
fs.writeFileSync('.env.local', env)
console.log('.env.local updated')

spawnSync('npx', ['vercel', 'env', 'rm', name, 'production', '-y'], { encoding: 'utf8', shell: true })
const add = spawnSync('npx', ['vercel', 'env', 'add', name, 'production'], {
  input: value,
  encoding: 'utf8',
  shell: true,
})
console.log(`${name} (len ${value.length}) ->`, (add.stdout + add.stderr).trim().split('\n').pop())
