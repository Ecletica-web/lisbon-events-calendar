/**
 * User-facing bug / feedback reports.
 * Stored in private Supabase Storage bucket `bug-reports`:
 *   {id}/report.json + {id}/screenshot.jpg
 * Admin APIs use the service role; no public bucket access.
 */

import { randomUUID } from 'crypto'
import { supabaseServer } from '@/lib/supabase/server'

export const BUG_REPORTS_BUCKET = 'bug-reports'

export type BugReportStatus = 'new' | 'triaged' | 'fixed' | 'wontfix'

export interface BugReport {
  id: string
  description: string
  page_url: string
  user_agent: string
  viewport: string
  screenshot_path: string | null
  user_id: string | null
  user_email: string | null
  status: BugReportStatus
  admin_notes: string
  created_at: string
  updated_at: string
}

export interface BugReportListItem extends BugReport {
  screenshot_url: string | null
}

const STATUSES: BugReportStatus[] = ['new', 'triaged', 'fixed', 'wontfix']
const MAX_DESCRIPTION = 2000
const MIN_DESCRIPTION = 3
const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024

function requireServer() {
  if (!supabaseServer) throw new Error('Supabase not configured')
  return supabaseServer
}

function reportPath(id: string) {
  return `${id}/report.json`
}

function screenshotPath(id: string, ext: string) {
  return `${id}/screenshot.${ext}`
}

export function parseCreateBugReportBody(input: {
  description?: unknown
  pageUrl?: unknown
  userAgent?: unknown
  viewport?: unknown
}): { description: string; page_url: string; user_agent: string; viewport: string } | null {
  const description = typeof input.description === 'string' ? input.description.trim() : ''
  if (description.length < MIN_DESCRIPTION || description.length > MAX_DESCRIPTION) return null
  return {
    description,
    page_url: typeof input.pageUrl === 'string' ? input.pageUrl.trim().slice(0, 2000) : '',
    user_agent: typeof input.userAgent === 'string' ? input.userAgent.trim().slice(0, 500) : '',
    viewport: typeof input.viewport === 'string' ? input.viewport.trim().slice(0, 64) : '',
  }
}

export function isBugReportStatus(v: unknown): v is BugReportStatus {
  return typeof v === 'string' && (STATUSES as string[]).includes(v)
}

async function ensureBucket(): Promise<void> {
  const sb = requireServer()
  const allowedMimeTypes = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/json',
    'text/plain',
  ]
  const { data: buckets } = await sb.storage.listBuckets()
  if (buckets?.some((b) => b.name === BUG_REPORTS_BUCKET)) {
    await sb.storage.updateBucket(BUG_REPORTS_BUCKET, {
      public: false,
      fileSizeLimit: 5242880,
      allowedMimeTypes,
    })
    return
  }
  await sb.storage.createBucket(BUG_REPORTS_BUCKET, {
    public: false,
    fileSizeLimit: 5242880,
    allowedMimeTypes,
  })
}

async function readReportJson(id: string): Promise<BugReport | null> {
  const sb = requireServer()
  const { data, error } = await sb.storage.from(BUG_REPORTS_BUCKET).download(reportPath(id))
  if (error || !data) return null
  try {
    const text = await data.text()
    const parsed = JSON.parse(text) as BugReport
    if (!parsed?.id || !parsed?.description) return null
    return parsed
  } catch {
    return null
  }
}

async function writeReportJson(report: BugReport): Promise<{ error?: string }> {
  const sb = requireServer()
  const body = JSON.stringify(report, null, 2)
  const { error } = await sb.storage.from(BUG_REPORTS_BUCKET).upload(reportPath(report.id), body, {
    contentType: 'application/json',
    upsert: true,
  })
  return error ? { error: error.message } : {}
}

export async function createBugReport(input: {
  description: string
  page_url: string
  user_agent: string
  viewport: string
  user_id?: string | null
  user_email?: string | null
  screenshot?: { buffer: Buffer; contentType: string } | null
}): Promise<{ data?: BugReport; error?: string }> {
  try {
    await ensureBucket()
    const sb = requireServer()
    const id = randomUUID()
    const now = new Date().toISOString()
    let shotPath: string | null = null

    if (input.screenshot?.buffer?.length) {
      if (input.screenshot.buffer.length > MAX_SCREENSHOT_BYTES) {
        return { error: 'Screenshot too large (max 4MB)' }
      }
      const mime = input.screenshot.contentType.toLowerCase()
      const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg'
      shotPath = screenshotPath(id, ext)
      const { error } = await sb.storage.from(BUG_REPORTS_BUCKET).upload(shotPath, input.screenshot.buffer, {
        contentType: input.screenshot.contentType || `image/${ext === 'jpg' ? 'jpeg' : ext}`,
        upsert: true,
      })
      if (error) return { error: `Screenshot upload failed: ${error.message}` }
    }

    const report: BugReport = {
      id,
      description: input.description,
      page_url: input.page_url,
      user_agent: input.user_agent,
      viewport: input.viewport,
      screenshot_path: shotPath,
      user_id: input.user_id ?? null,
      user_email: input.user_email ?? null,
      status: 'new',
      admin_notes: '',
      created_at: now,
      updated_at: now,
    }

    const written = await writeReportJson(report)
    if (written.error) return { error: written.error }
    return { data: report }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to create bug report' }
  }
}

export async function listBugReports(): Promise<{ data: BugReportListItem[]; error?: string }> {
  try {
    await ensureBucket()
    const sb = requireServer()
    const { data: entries, error } = await sb.storage.from(BUG_REPORTS_BUCKET).list('', {
      limit: 1000,
      sortBy: { column: 'created_at', order: 'desc' },
    })
    if (error) return { data: [], error: error.message }

    const ids = (entries ?? [])
      .filter((e) => e.name && !e.name.includes('.'))
      .map((e) => e.name)

    const reports: BugReportListItem[] = []
    for (const id of ids) {
      const report = await readReportJson(id)
      if (!report) continue
      let screenshot_url: string | null = null
      if (report.screenshot_path) {
        const { data: signed } = await sb.storage
          .from(BUG_REPORTS_BUCKET)
          .createSignedUrl(report.screenshot_path, 60 * 60)
        screenshot_url = signed?.signedUrl ?? null
      }
      reports.push({ ...report, screenshot_url })
    }

    reports.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    return { data: reports }
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Failed to list bug reports' }
  }
}

export async function updateBugReport(
  id: string,
  patch: { status?: BugReportStatus; admin_notes?: string }
): Promise<{ data?: BugReport; error?: string }> {
  try {
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return { error: 'Invalid id' }
    const report = await readReportJson(id)
    if (!report) return { error: 'Not found' }

    if (patch.status !== undefined) {
      if (!isBugReportStatus(patch.status)) return { error: 'Invalid status' }
      report.status = patch.status
    }
    if (typeof patch.admin_notes === 'string') {
      report.admin_notes = patch.admin_notes.trim().slice(0, 4000)
    }
    report.updated_at = new Date().toISOString()

    const written = await writeReportJson(report)
    if (written.error) return { error: written.error }
    return { data: report }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to update bug report' }
  }
}

/** Optional: resolve user from Bearer token for attaching identity to a report. */
export async function resolveOptionalUser(accessToken: string | null): Promise<{
  user_id: string | null
  user_email: string | null
}> {
  if (!accessToken || !supabaseServer) return { user_id: null, user_email: null }
  const {
    data: { user },
  } = await supabaseServer.auth.getUser(accessToken)
  return {
    user_id: user?.id ?? null,
    user_email: user?.email ?? null,
  }
}
