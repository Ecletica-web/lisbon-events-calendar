/**
 * Mark open (status=new) bug reports as fixed after Terminus feedback pass.
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

const NOTE =
  'Fixed in Terminus pass: brand rename, terminal chrome (chat/onboarding/profile/persona), calendar filter copy + nav icons, friends_list_private, Capsula→promoter + Those Who Dance promoter, pipeline promoter stamp.'

async function main() {
  const env = loadEnv()
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
  const { data: folders, error } = await sb.storage.from('bug-reports').list('', { limit: 200 })
  if (error) throw error
  let updated = 0
  for (const f of folders || []) {
    if (!f.name || f.name.includes('.')) continue
    const path = `${f.name}/report.json`
    const { data: blob, error: dlErr } = await sb.storage.from('bug-reports').download(path)
    if (dlErr || !blob) continue
    const report = JSON.parse(await blob.text())
    if (report.status !== 'new') continue
    report.status = 'fixed'
    report.admin_notes = [report.admin_notes, NOTE].filter(Boolean).join('\n')
    report.updated_at = new Date().toISOString()
    const { error: upErr } = await sb.storage
      .from('bug-reports')
      .upload(path, JSON.stringify(report, null, 2), {
        contentType: 'application/json',
        upsert: true,
      })
    if (upErr) console.error('fail', f.name, upErr.message)
    else {
      updated++
      console.log('fixed', f.name, (report.page_url || '').slice(0, 60), (report.description || '').slice(0, 60))
    }
  }
  console.log('UPDATED', updated)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
