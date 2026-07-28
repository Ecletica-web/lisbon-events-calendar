/**
 * One-off: apply catalog migrations 025+026 via Supabase SQL if possible,
 * else verify tables and report. Uses service role + PostgREST existence checks.
 * For DDL, uses the Supabase Management-less approach: execute through
 * postgres REST is unavailable, so we try @supabase/supabase-js rpc exec if present,
 * otherwise print SQL for manual apply — OR use pg with DATABASE_URL.
 */
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing SUPABASE URL / SERVICE_ROLE_KEY')
  process.exit(1)
}

const sb = createClient(url, key, { auth: { persistSession: false } })

async function tableStatus(name: string): Promise<'ok' | 'missing' | string> {
  const { error, count } = await sb.from(name).select('*', { count: 'exact', head: true })
  if (!error) return `ok count=${count ?? 0}`
  if (/relation|does not exist|schema cache/i.test(error.message)) return 'missing'
  return error.message
}

async function main() {
  const before: Record<string, string> = {}
  for (const t of ['venues', 'promoters', 'pipeline_catalog_candidates']) {
    before[t] = await tableStatus(t)
    console.log(`before ${t}: ${before[t]}`)
  }

  const need025 = before.venues === 'missing' || before.promoters === 'missing'
  const need026 = before.pipeline_catalog_candidates === 'missing'

  if (!need025 && !need026) {
    console.log('All catalog tables already exist — nothing to apply.')
    return
  }

  // Try database URL if present
  const dbUrl =
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DB_URL ||
    process.env.POSTGRES_URL ||
    process.env.DIRECT_URL

  if (!dbUrl) {
    console.error(
      'Tables missing but no DATABASE_URL/SUPABASE_DB_URL. Cannot run DDL with service role alone.'
    )
    console.error('Apply these in Supabase SQL Editor, then re-run seed:')
    if (need025) console.error('  supabase/migrations/025_catalog_venues_promoters.sql')
    if (need026) console.error('  supabase/migrations/026_pipeline_catalog_candidates.sql')
    process.exit(2)
  }

  const { default: pg } = await import('pg').catch(() => ({ default: null as unknown }))
  if (!pg) {
    console.error('Install pg to apply DDL: npm i -D pg @types/pg')
    process.exit(2)
  }
  // @ts-expect-error dynamic
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
  await client.connect()
  try {
    if (need025) {
      const sql = fs.readFileSync(
        path.join(__dirname, '../../supabase/migrations/025_catalog_venues_promoters.sql'),
        'utf8'
      )
      await client.query(sql)
      console.log('Applied 025_catalog_venues_promoters.sql')
    }
    if (need026) {
      const sql = fs.readFileSync(
        path.join(__dirname, '../../supabase/migrations/026_pipeline_catalog_candidates.sql'),
        'utf8'
      )
      await client.query(sql)
      console.log('Applied 026_pipeline_catalog_candidates.sql')
    }
  } finally {
    await client.end()
  }

  for (const t of ['venues', 'promoters', 'pipeline_catalog_candidates']) {
    console.log(`after ${t}: ${await tableStatus(t)}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
