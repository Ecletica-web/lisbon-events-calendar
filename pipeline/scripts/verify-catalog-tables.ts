import * as fs from 'fs'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'

function loadEnv(filePath: string) {
  if (!fs.existsSync(filePath)) return
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    let v = m[2]
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    if (!process.env[m[1]]) process.env[m[1]] = v
  }
}

loadEnv(path.join(__dirname, '../../.env.local'))
loadEnv(path.join(__dirname, '../.env'))

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const sb = createClient(url, key, { auth: { persistSession: false } })

async function main() {
  for (const t of ['venues', 'promoters', 'pipeline_catalog_candidates'] as const) {
    const r = await sb.from(t).select('*').limit(1)
    if (r.error) console.log(t, 'MISSING/ERR', r.error.message)
    else console.log(t, 'EXISTS', 'rows_sample', (r.data || []).length)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
