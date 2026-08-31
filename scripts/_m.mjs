import { readFileSync } from 'node:fs'
for (const l of readFileSync('.env.local','utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) process.env[m[1]] ??= m[2].trim()
}
const ref = process.env.NEXT_PUBLIC_SUPABASE_URL.match(/\/\/([a-z0-9]+)\./)[1]
const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: readFileSync(process.argv[2], 'utf8') }),
})
console.log(r.ok ? `✓ ${process.argv[2]}` : `✗ ${await r.text()}`)
