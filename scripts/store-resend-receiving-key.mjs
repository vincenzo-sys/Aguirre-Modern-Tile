// Store a Resend full-access API key as RESEND_RECEIVING_API_KEY in .env.local
// and Vercel production, after verifying it is not a send-only restricted key.
//
// The inbound webhook needs it: the send-only key returns
// "restricted_api_key" on GET /emails/receiving/{id}, so email bodies would
// never load. Reads the key from a file so it never appears in a command line
// or in git.
//
// Usage: node scripts/store-resend-receiving-key.mjs <path-to-file-with-key>
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

const NAME = 'RESEND_RECEIVING_API_KEY'
const keyFile = process.argv[2]
if (!keyFile) {
  console.error('Usage: node scripts/store-resend-receiving-key.mjs <path-to-key-file>')
  process.exit(1)
}
const VALUE = fs.readFileSync(keyFile, 'utf8').trim()
if (!/^re_[A-Za-z0-9_]{15,}$/.test(VALUE)) {
  console.error('File does not contain a Resend API key')
  process.exit(1)
}

const res = await fetch('https://api.resend.com/domains', {
  headers: { Authorization: `Bearer ${VALUE}` },
})
console.log('GET /domains ->', res.status)
if (res.status !== 200) {
  console.error('Key lacks full access (send-only keys 401 here) — not storing.')
  console.error((await res.text()).slice(0, 200))
  process.exit(1)
}

let env = fs.readFileSync('.env.local', 'utf8').replace(/\r\n/g, '\n')
const re = new RegExp(`^${NAME}=.*$`, 'm')
env = re.test(env)
  ? env.replace(re, `${NAME}=${VALUE}`)
  : env.replace(/\n*$/, '\n') + `${NAME}=${VALUE}\n`
fs.writeFileSync('.env.local', env)
console.log('.env.local updated')

spawnSync('npx', ['vercel', 'env', 'rm', NAME, 'production', '-y'], { encoding: 'utf8', shell: true })
const add = spawnSync('npx', ['vercel', 'env', 'add', NAME, 'production'], {
  input: VALUE, // exact bytes — a piped newline once failed a prod build
  encoding: 'utf8',
  shell: true,
})
console.log(`${NAME} (len ${VALUE.length}) ->`, (add.stdout + add.stderr).trim().split('\n').pop())
