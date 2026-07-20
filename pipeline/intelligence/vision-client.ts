/**
 * Vision + text model router.
 * - Text passes: OpenAI chat completions (PIPELINE_TEXT_MODEL, default gpt-4o-mini).
 * - Vision passes: NVIDIA NIM (Nemotron VL) or OpenAI vision, selected by
 *   PROCESSING_VISION_PROVIDER, with OpenAI fallback when NIM fails.
 * Images are sent as base64 data URIs (max 4 per request for Nemotron).
 */

import OpenAI from 'openai'
import { getConfig, requireConfig } from '../config'

export const MAX_IMAGES_PER_VISION_REQUEST = 4

export interface VisionImage {
  base64: string
  mime: string
}

let openaiClient: OpenAI | null = null

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: requireConfig('OPENAI_API_KEY', 'OpenAI text/vision') })
  }
  return openaiClient
}

/** Text-only chat returning the raw assistant message (expects JSON output from the prompt). */
export async function textChatJson(system: string, user: string): Promise<string> {
  const cfg = getConfig()
  const res = await getOpenAI().chat.completions.create({
    model: cfg.PIPELINE_TEXT_MODEL,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  })
  return res.choices[0]?.message?.content ?? ''
}

type MultimodalContent = (
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
)[]

function buildContent(prompt: string, images: VisionImage[]): MultimodalContent {
  const content: MultimodalContent = [{ type: 'text', text: prompt }]
  for (const img of images.slice(0, MAX_IMAGES_PER_VISION_REQUEST)) {
    content.push({
      type: 'image_url',
      image_url: { url: `data:${img.mime};base64,${img.base64}` },
    })
  }
  return content
}

async function nvidiaVisionChat(system: string, prompt: string, images: VisionImage[]): Promise<string> {
  const cfg = getConfig()
  const apiKey = requireConfig('NVIDIA_NIM_API_KEY', 'NVIDIA NIM vision')
  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.PROCESSING_VISION_NVIDIA_MODEL,
      temperature: 0,
      max_tokens: 4096,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: buildContent(prompt, images) },
      ],
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`NVIDIA NIM error ${res.status}: ${body.slice(0, 300)}`)
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return data.choices?.[0]?.message?.content ?? ''
}

async function openaiVisionChat(system: string, prompt: string, images: VisionImage[]): Promise<string> {
  const cfg = getConfig()
  const res = await getOpenAI().chat.completions.create({
    model: cfg.PROCESSING_VISION_OPENAI_MODEL,
    temperature: 0,
    max_tokens: 4096,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: buildContent(prompt, images) as never },
    ],
  })
  return res.choices[0]?.message?.content ?? ''
}

/** Single multimodal entrypoint — fans out to the configured provider, falls back to OpenAI. */
export async function processingVisionChatMultimodal(
  system: string,
  prompt: string,
  images: VisionImage[]
): Promise<string> {
  const cfg = getConfig()
  if (cfg.PROCESSING_VISION_PROVIDER === 'nvidia' && cfg.NVIDIA_NIM_API_KEY) {
    try {
      return await nvidiaVisionChat(system, prompt, images)
    } catch (err) {
      console.error('[vision] NVIDIA NIM failed, falling back to OpenAI:', err instanceof Error ? err.message : err)
      if (!cfg.OPENAI_API_KEY) throw err
    }
  }
  return openaiVisionChat(system, prompt, images)
}

/** Extract the first JSON object/array from model output (tolerates markdown fences). */
export function extractJson<T>(text: string): T | null {
  if (!text) return null
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced ? fenced[1] : text
  const start = candidate.search(/[{[]/)
  if (start === -1) return null
  for (let end = candidate.length; end > start; end--) {
    const slice = candidate.slice(start, end).trim()
    if (!slice.endsWith('}') && !slice.endsWith(']')) continue
    try {
      return JSON.parse(slice) as T
    } catch {
      // keep shrinking
    }
  }
  return null
}
