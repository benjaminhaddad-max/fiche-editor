import { readFileSync } from 'node:fs'
for (const l of readFileSync('.env.local','utf8').split('\n')) { const m=l.match(/^([A-Z0-9_]+)=(.*)$/); if(m) process.env[m[1]] ??= m[2].trim() }
import { createClient } from '@supabase/supabase-js'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const CIBLES = ['almgadmee.danial@gmail.com','genuismhaude@gmail.com','przybylowiczalexandra@gmail.com']
const { data: u } = await db.from('inv_users').select('full_name, email, is_active').in('email', CIBLES)
for (const x of u) console.log(`${x.is_active ? '✗ ENCORE ACTIF' : '✓ désactivé'}  ${x.full_name}`)
const { data: c } = await db.from('inv_coaching_contracts').select('status, provider:inv_providers(user:inv_users!inv_providers_user_id_fkey(full_name, email))')
console.log('\ncontrats encore actifs :', c.filter(x=>x.status==='active').length, '/', c.length)
for (const x of c.filter(x=>x.status!=='active')) console.log('  ', x.status, '—', x.provider?.user?.full_name)
// Vérification réelle : la connexion doit être refusée.
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const { data: s } = await db.from('inv_users').select('auth_id').eq('email','genuismhaude@gmail.com').single()
const { data: me } = await db.rpc('inv_me').catch(()=>({data:null}))
console.log('\nprestataires actifs restants :')
const { data: act } = await db.from('inv_users').select('full_name').eq('role','prestataire').eq('is_active', true).order('full_name')
console.log('  ' + act.map(x=>x.full_name).join(', '), `(${act.length})`)
