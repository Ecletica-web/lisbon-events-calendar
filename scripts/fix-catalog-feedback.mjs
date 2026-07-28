/**
 * One-shot catalog fixes from user feedback:
 * - Capsula Melódica: venue → promoter (capsulamelodica.pt)
 * - Those Who Dance: ensure promoter thosewhodance__
 */
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

function loadEnv(path = '.env.local') {
  const env = {}
  if (!fs.existsSync(path)) return env
  for (const line of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 0) continue
    let v = line.slice(i + 1).trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    env[line.slice(0, i).trim()] = v
  }
  return env
}

const env = loadEnv()
const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing SUPABASE url or service role key')
  process.exit(1)
}
const sb = createClient(url, key, { auth: { persistSession: false } })

function slugify(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

async function main() {
  // 1) Capsula Melódica → promoter
  const capsulaName = 'Cápsula Melódica'
  const capsulaHandle = 'capsulamelodica.pt'
  const capsulaId = slugify(capsulaName) || 'capsula-melodica'

  const { data: venueHits } = await sb
    .from('venues')
    .select('venue_id,name,instagram_handle,is_active,slug')
    .or(
      `venue_id.eq.${capsulaId},slug.eq.${capsulaId},instagram_handle.ilike.%capsulamelodica%`
    )

  console.log('venue hits:', venueHits)

  const { data: prom, error: promErr } = await sb
    .from('promoters')
    .upsert(
      {
        promoter_id: capsulaId,
        name: capsulaName,
        slug: capsulaId,
        instagram_handle: capsulaHandle,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'promoter_id' }
    )
    .select('*')
    .single()
  if (promErr) console.error('promoter upsert capsula:', promErr.message)
  else console.log('upserted promoter:', prom.promoter_id, prom.name)

  for (const v of venueHits || []) {
    const { error } = await sb.from('venues').delete().eq('venue_id', v.venue_id)
    if (error) {
      console.warn('delete venue failed, deactivating', v.venue_id, error.message)
      await sb
        .from('venues')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('venue_id', v.venue_id)
    } else {
      console.log('deleted venue', v.venue_id)
    }
  }

  // 2) Those Who Dance promoter
  const twdHandle = 'thosewhodance__'
  const twdName = 'Those Who Dance'
  const twdId = 'those-who-dance'
  const { data: twd, error: twdErr } = await sb
    .from('promoters')
    .upsert(
      {
        promoter_id: twdId,
        name: twdName,
        slug: twdId,
        instagram_handle: twdHandle,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'promoter_id' }
    )
    .select('*')
    .single()
  if (twdErr) console.error('promoter upsert twd:', twdErr.message)
  else console.log('upserted promoter:', twd.promoter_id, twd.name, twd.instagram_handle)

  // Remove mistyped venue if any
  const { data: twdVenues } = await sb
    .from('venues')
    .select('venue_id,name,instagram_handle')
    .or(`instagram_handle.ilike.%thosewhodance%,name.ilike.%those who dance%`)
  for (const v of twdVenues || []) {
    console.log('removing misclassified venue', v)
    await sb.from('venues').delete().eq('venue_id', v.venue_id)
  }

  console.log('done')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
