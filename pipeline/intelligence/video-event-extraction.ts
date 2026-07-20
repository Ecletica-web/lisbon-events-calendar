/**
 * Tier 4 — deep video (reels). Flag-gated, lowest priority:
 * ffmpeg frame sampling + optional Whisper transcript + vision pass on frames.
 * Requires ffmpeg on PATH when PIPELINE_VIDEO_FRAMES=1.
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import OpenAI from 'openai'
import type { EventsRawRow, ExtractionResult, ExtractedEvent } from '../types'
import { getConfig, requireConfig } from '../config'
import { processingVisionChatMultimodal, extractJson, type VisionImage } from './vision-client'
import { extractionResponseSchema } from './broad-event-extraction'

const execFileAsync = promisify(execFile)
const FRAME_COUNT = 4

const SYSTEM_PROMPT = `You extract structured event data from Instagram reel frames (and an optional audio transcript) posted by Lisbon venues.
Timezone Europe/Lisbon; datetimes as ISO 8601 with offset; posted_at is the reference for partial dates (events are upcoming).
Portuguese and English text. On-screen text in frames (flyer overlays) is the most reliable date source.
confidence_score reflects certainty about DATE and VENUE; never guess dates.
Respond with JSON only: {"events":[{"title","description_short","category","tags","start_datetime","end_datetime","venue_name_raw","price_min","price_max","currency","is_free","ticket_url","confidence_score"}],"extraction_notes":"..."}`

export function isVideoPassEnabled(): boolean {
  const cfg = getConfig()
  return Boolean(cfg.PIPELINE_VIDEO_FRAMES || cfg.PIPELINE_VIDEO_WHISPER)
}

async function downloadVideo(url: string, dest: string): Promise<boolean> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'LisbonEventsPipeline/1.0' } })
    if (!res.ok) return false
    const buffer = Buffer.from(await res.arrayBuffer())
    if (buffer.byteLength > 100 * 1024 * 1024) return false
    fs.writeFileSync(dest, buffer)
    return true
  } catch {
    return false
  }
}

async function extractFrames(videoPath: string, outDir: string): Promise<string[]> {
  // Sample FRAME_COUNT frames evenly-ish via fps filter (1 frame every N seconds capped)
  const pattern = path.join(outDir, 'frame_%02d.jpg')
  try {
    await execFileAsync('ffmpeg', [
      '-i', videoPath,
      '-vf', 'fps=1/8,scale=960:-1',
      '-frames:v', String(FRAME_COUNT),
      '-q:v', '4',
      pattern,
      '-y',
    ])
  } catch (err) {
    console.error('[video] ffmpeg frame extraction failed (is ffmpeg installed?):', err instanceof Error ? err.message : err)
    return []
  }
  return fs
    .readdirSync(outDir)
    .filter((f) => f.startsWith('frame_') && f.endsWith('.jpg'))
    .sort()
    .map((f) => path.join(outDir, f))
}

async function transcribeAudio(videoPath: string): Promise<string> {
  const cfg = getConfig()
  if (!cfg.PIPELINE_VIDEO_WHISPER) return ''
  try {
    const openai = new OpenAI({ apiKey: requireConfig('OPENAI_API_KEY', 'Whisper transcription') })
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(videoPath),
      model: 'whisper-1',
    })
    return transcription.text ?? ''
  } catch (err) {
    console.error('[video] Whisper transcription failed:', err instanceof Error ? err.message : err)
    return ''
  }
}

export async function videoEventExtraction(row: EventsRawRow): Promise<ExtractionResult> {
  if (!isVideoPassEnabled()) {
    return { events: [], extraction_notes: 'video_pass_disabled', raw_model_text: '' }
  }
  if (!row.video_url) {
    return { events: [], extraction_notes: 'no_video_url', raw_model_text: '' }
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lisbon-video-'))
  const videoPath = path.join(workDir, 'video.mp4')

  try {
    if (!(await downloadVideo(row.video_url, videoPath))) {
      return { events: [], extraction_notes: 'video_download_failed', raw_model_text: '' }
    }

    const cfg = getConfig()
    const framePaths = cfg.PIPELINE_VIDEO_FRAMES ? await extractFrames(videoPath, workDir) : []
    const transcript = await transcribeAudio(videoPath)

    if (framePaths.length === 0 && !transcript) {
      return { events: [], extraction_notes: 'no_frames_or_transcript', raw_model_text: '' }
    }

    const images: VisionImage[] = framePaths.map((p) => ({
      base64: fs.readFileSync(p).toString('base64'),
      mime: 'image/jpeg',
    }))

    const prompt = JSON.stringify({
      caption: row.caption.slice(0, 3000),
      owner_username: row.owner_username,
      location_name: row.location_name,
      posted_at: row.posted_at,
      audio_transcript: transcript.slice(0, 4000) || undefined,
      frame_count: images.length,
    })

    const rawText = await processingVisionChatMultimodal(SYSTEM_PROMPT, prompt, images)
    const parsed = extractionResponseSchema.safeParse(extractJson<unknown>(rawText))
    if (!parsed.success) {
      return { events: [], extraction_notes: 'video_parse_error', raw_model_text: rawText }
    }

    const events: ExtractedEvent[] = parsed.data.events.map((e) => ({
      ...e,
      price_min: e.price_min ?? undefined,
      price_max: e.price_max ?? undefined,
      tags: e.tags.slice(0, 5).map((t) => t.toLowerCase().trim()).filter(Boolean),
      extraction_source: 'vision' as const,
    }))

    return {
      events,
      extraction_notes: parsed.data.extraction_notes,
      raw_model_text: rawText,
      video_transcript: transcript || undefined,
    }
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
}
