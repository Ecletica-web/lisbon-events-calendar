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

const shortcodes = [
  'Da8wZ94jQEB',
  'Da70-GJNbH7',
  'Da7mfLkDRzd',
  'Da5ooyZF_FH',
  'Da2Bm5ODRv1',
  'Da0T05djciq',
  'Daz_IN0lz71',
  'Dax-iM-jdvZ',
  'DavLodctss7',
  'Dau2vitF4hn',
  'DasP-Sqlz35',
  'DaoOizZDeTS',
  'DankH_tt23C',
  'Dam9vDbCF3l',
  'DaiNL4Vk6jD',
]

async function main() {
  const { data: posts, error } = await sb
    .from('pipeline_posts')
    .select(
      'id, source_event_id, short_code, owner_username, processing_status, scraped_at, permalink, source_url, raw_json'
    )
    .gte('scraped_at', '2026-07-22T00:39:00Z')
    .lte('scraped_at', '2026-07-22T00:40:00Z')

  if (error) throw error

  const ids = (posts || []).map((p) => p.id)
  const { data: tiers, error: tErr } = await sb
    .from('pipeline_extractions')
    .select('post_id, tier, model, parsed_json, created_at')
    .in('post_id', ids)
    .order('created_at', { ascending: true })
  if (tErr) throw tErr

  function codeOf(p: Record<string, unknown>): string {
    if (typeof p.short_code === 'string' && p.short_code) return p.short_code
    const raw = p.raw_json
    if (typeof raw === 'string') {
      try {
        const j = JSON.parse(raw)
        if (j.shortCode) return j.shortCode
        if (j.shortcode) return j.shortcode
      } catch {
        /* ignore */
      }
    } else if (raw && typeof raw === 'object' && (raw as { shortCode?: string }).shortCode) {
      return (raw as { shortCode: string }).shortCode
    }
    const permalink = String(p.permalink || p.source_url || '')
    const m = permalink.match(/\/(p|reel)\/([^/?#]+)/)
    return m?.[2] || String(p.source_event_id)
  }

  const tiersByPost = new Map<string, NonNullable<typeof tiers>>()
  for (const t of tiers || []) {
    const list = tiersByPost.get(t.post_id) || []
    list.push(t)
    tiersByPost.set(t.post_id, list)
  }

  const perPost = (posts || []).map((p) => {
    const code = codeOf(p)
    const pt = tiersByPost.get(p.id) || []
    const vision = pt.filter((t) => t.tier === 'vision' || (t.model || '').includes('nemotron'))
    const byTier: Record<string, unknown> = {}
    for (const t of pt) {
      const j = t.parsed_json as Record<string, unknown> | null
      const events = Array.isArray(j?.events) ? (j!.events as unknown[]) : null
      byTier[t.tier] = {
        model: t.model,
        event_count: events?.length,
        titles: events
          ?.slice(0, 6)
          .map((e) => (e as { title?: string }).title)
          .filter(Boolean),
        notes:
          typeof j?.extraction_notes === 'string'
            ? j.extraction_notes.slice(0, 220)
            : typeof j?.reason === 'string'
              ? j.reason.slice(0, 220)
              : undefined,
        pre_filter:
          t.tier === 'pre_filter'
            ? {
                is_event_post: j?.is_event_post,
                post_pattern: j?.post_pattern,
                confidence: j?.confidence,
              }
            : undefined,
        validation: t.tier === 'validation' ? j : undefined,
      }
    }
    return {
      code,
      owner: p.owner_username,
      status: p.processing_status,
      in_log: shortcodes.includes(code),
      models: [...new Set(pt.map((t) => `${t.tier}:${t.model || '?'}`))],
      nemotron: vision.length > 0,
      vision_events: vision.flatMap((v) => {
        const j = v.parsed_json as { events?: { title?: string }[]; extraction_notes?: string } | null
        return [
          {
            model: v.model,
            count: j?.events?.length ?? 0,
            titles: (j?.events || []).map((e) => e.title).filter(Boolean),
            notes: j?.extraction_notes?.slice(0, 220),
          },
        ]
      }),
      byTier,
    }
  })

  const nemotron = perPost.filter((p) => p.nemotron)

  fs.writeFileSync(
    path.join('out', 'intel-transparency.json'),
    JSON.stringify(
      {
        posts: posts?.length ?? 0,
        extractions: tiers?.length ?? 0,
        nemotron_posts: nemotron.length,
        models_seen: [...new Set((tiers || []).map((t) => t.model).filter(Boolean))],
        tier_counts: Object.fromEntries(
          [...(tiers || []).reduce((m, t) => m.set(t.tier, (m.get(t.tier) || 0) + 1), new Map<string, number>())]
        ),
        nemotron_detail: nemotron.map((p) => ({
          code: p.code,
          owner: p.owner,
          status: p.status,
          vision_events: p.vision_events,
        })),
        per_post: perPost.sort((a, b) => a.code.localeCompare(b.code)),
      },
      null,
      2
    )
  )
  console.log(
    JSON.stringify(
      {
        posts: posts?.length,
        nemotron_posts: nemotron.length,
        models_seen: [...new Set((tiers || []).map((t) => t.model).filter(Boolean))],
        tier_counts: Object.fromEntries(
          [...(tiers || []).reduce((m, t) => m.set(t.tier, (m.get(t.tier) || 0) + 1), new Map<string, number>())]
        ),
        nemotron_codes: nemotron.map((p) => p.code),
      },
      null,
      2
    )
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
