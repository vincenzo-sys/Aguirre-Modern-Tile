// One-off: create Christian's owner-level account.
//
// Creates the auth.users row via Supabase admin API, then inserts the
// matching profiles row with role='owner'. Idempotent — re-running on an
// existing email is a no-op (logs and exits).
//
// Usage: node scripts/create-christian.mjs

import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

async function loadEnv() {
  const text = await fs.readFile(path.resolve('.env.local'), 'utf8')
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
}

function generatePassword() {
  // 16 chars, alphanum + a few symbols. URL-safe-ish so it survives a copy/paste
  // through SMS without escaping headaches.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$'
  const buf = crypto.randomBytes(16)
  let out = ''
  for (const b of buf) out += alphabet[b % alphabet.length]
  return out
}

async function main() {
  await loadEnv()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(1)
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const email = 'moderntilesllc@gmail.com'
  const fullName = 'Christian Aguirre'
  const phone = '+16175101495'
  const role = 'owner'
  const password = generatePassword()

  // Idempotency check — if a user with this email already exists, bail.
  const { data: existing } = await supabase.auth.admin.listUsers()
  const already = existing?.users?.find((u) => u.email === email)
  if (already) {
    console.log(`User ${email} already exists (id=${already.id}). No changes.`)

    // Make sure the profile row exists and is correct.
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', already.id).single()
    if (!prof) {
      const { error } = await supabase.from('profiles').insert({
        id: already.id,
        email,
        full_name: fullName,
        role,
        phone,
        is_active: true,
      })
      if (error) {
        console.error('Failed to create profiles row:', error.message)
        process.exit(1)
      }
      console.log(`Created missing profiles row for ${email}.`)
    } else {
      console.log(`Profile row exists. role=${prof.role} full_name=${prof.full_name} phone=${prof.phone}`)
    }
    return
  }

  // 1. Create auth user with email_confirm so he doesn't have to verify before login.
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })
  if (createErr || !created?.user) {
    console.error('Failed to create auth user:', createErr?.message)
    process.exit(1)
  }
  const userId = created.user.id
  console.log(`Created auth user: id=${userId}`)

  // 2. Insert profiles row.
  const { error: profErr } = await supabase.from('profiles').insert({
    id: userId,
    email,
    full_name: fullName,
    role,
    phone,
    is_active: true,
  })
  if (profErr) {
    console.error('Failed to insert profiles row:', profErr.message)
    // Roll back auth user so we don't leave a half-created account.
    await supabase.auth.admin.deleteUser(userId)
    console.error('Rolled back auth user.')
    process.exit(1)
  }

  console.log('\n──────────────────────────────────────────')
  console.log('  Christian account created successfully')
  console.log('──────────────────────────────────────────')
  console.log(`  Email:    ${email}`)
  console.log(`  Password: ${password}`)
  console.log(`  Role:     ${role}`)
  console.log(`  Phone:    ${phone}`)
  console.log('──────────────────────────────────────────')
  console.log('  Login URL: https://www.aguirremoderntile.com/login')
  console.log('  Tell him to change his password on first login.')
  console.log('──────────────────────────────────────────\n')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
