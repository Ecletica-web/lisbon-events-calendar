/**
 * Google Document AI Enterprise OCR — per-slide text extraction with layout.
 * High ROI for event flyers: small date/venue text that VL models misread.
 * Optional: returns null per slide when DOCUMENT_AI_ENABLED is off or a call fails.
 */

import * as fs from 'fs'
import { GoogleAuth } from 'google-auth-library'
import { getConfig, requireConfig } from '../config'

export interface OcrTextBlock {
  text: string
  /** Normalized bounding box [x0, y0, x1, y1] in 0..1 */
  bbox: [number, number, number, number]
}

export interface SlideOcr {
  slide_index: number
  full_text: string
  blocks: OcrTextBlock[]
}

let auth: GoogleAuth | null = null

function getAuth(): GoogleAuth {
  if (!auth) {
    const raw = requireConfig('DOCUMENT_AI_SERVICE_ACCOUNT_JSON', 'Document AI OCR')
    const credentials = raw.trim().startsWith('{')
      ? JSON.parse(raw)
      : JSON.parse(fs.readFileSync(raw.trim(), 'utf8'))
    auth = new GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    })
  }
  return auth
}

export function isDocAiEnabled(): boolean {
  const cfg = getConfig()
  return Boolean(
    cfg.DOCUMENT_AI_ENABLED &&
      cfg.DOCUMENT_AI_PROJECT_ID &&
      cfg.DOCUMENT_AI_PROCESSOR_ID &&
      cfg.DOCUMENT_AI_SERVICE_ACCOUNT_JSON
  )
}

interface DocAiDocument {
  text?: string
  pages?: {
    blocks?: {
      layout?: {
        textAnchor?: { textSegments?: { startIndex?: string; endIndex?: string }[] }
        boundingPoly?: { normalizedVertices?: { x?: number; y?: number }[] }
      }
    }[]
  }[]
}

function anchorText(doc: DocAiDocument, anchor?: { textSegments?: { startIndex?: string; endIndex?: string }[] }): string {
  if (!anchor?.textSegments || !doc.text) return ''
  return anchor.textSegments
    .map((seg) => doc.text!.slice(Number(seg.startIndex ?? 0), Number(seg.endIndex ?? 0)))
    .join('')
    .trim()
}

export async function ocrSlide(
  imageBase64: string,
  mime: string,
  slideIndex: number
): Promise<SlideOcr | null> {
  if (!isDocAiEnabled()) return null
  const cfg = getConfig()
  const projectId = requireConfig('DOCUMENT_AI_PROJECT_ID', 'Document AI OCR')
  const processorId = requireConfig('DOCUMENT_AI_PROCESSOR_ID', 'Document AI OCR')
  const location = cfg.DOCUMENT_AI_LOCATION

  try {
    const client = await getAuth().getClient()
    const token = await client.getAccessToken()
    const url = `https://${location}-documentai.googleapis.com/v1/projects/${projectId}/locations/${location}/processors/${processorId}:process`

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token.token}`,
      },
      body: JSON.stringify({
        rawDocument: { content: imageBase64, mimeType: mime },
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[docai] slide ${slideIndex} error ${res.status}: ${body.slice(0, 200)}`)
      return null
    }
    const data = (await res.json()) as { document?: DocAiDocument }
    const doc = data.document
    if (!doc) return null

    const blocks: OcrTextBlock[] = []
    for (const page of doc.pages ?? []) {
      for (const block of page.blocks ?? []) {
        const text = anchorText(doc, block.layout?.textAnchor)
        if (!text) continue
        const vertices = block.layout?.boundingPoly?.normalizedVertices ?? []
        const xs = vertices.map((v) => v.x ?? 0)
        const ys = vertices.map((v) => v.y ?? 0)
        blocks.push({
          text,
          bbox: [
            Math.min(...xs, 1), Math.min(...ys, 1),
            Math.max(...xs, 0), Math.max(...ys, 0),
          ],
        })
      }
    }

    return { slide_index: slideIndex, full_text: (doc.text ?? '').trim(), blocks }
  } catch (err) {
    console.error(`[docai] slide ${slideIndex} failed:`, err instanceof Error ? err.message : err)
    return null
  }
}
