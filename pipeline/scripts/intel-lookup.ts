import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

config({ path: path.join(process.cwd(), '.env'), quiet: true })
config({ path: path.join(process.cwd(), '..', '.env.local'), override: true, quiet: true })

const sb = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  const { data: byIlike, error } = await sb
    .from('pipeline_posts')
    .select('id, source_event_id, owner_username, processing_status, scraped_at')
    .ilike('source_event_id', '%Da8wZ94jQEB%')
    .limit(5)

  const { data: byWindow } = await sb
    .from('pipeline_posts')
    .select('id, source_event_id, owner_username, processing_status, scraped_at')
    .gte('scraped_at', '2026-07-22T00:35:00Z')
    .lte('scraped_at', '2026-07-22T00:45:00Z')
    .limit(40)

  const { data: latest } = await sb
    .from('pipeline_posts')
    .select('id, source_event_id, owner_username, processing_status, scraped_at')
    .order('scraped_at', { ascending: false })
    .limit(25)

  const { data: sampleExt } = await sb
    .from('pipeline_extractions')
    .select('id, post_id, tier, model, created_at')
    .order('created_at', { ascending: false })
    .limit(30)

  fs.writeFileSync(
    path.join('out', 'intel-lookup.json'),
    JSON.stringify({ error, byIlike, byWindow, latest, sampleExt }, null, 2)
  )
  console.log('wrote out/intel-lookup.json')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
