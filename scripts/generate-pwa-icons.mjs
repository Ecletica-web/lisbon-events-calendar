/**
 * Generates City Pager PWA icons (B&W pager mark).
 * Run: node scripts/generate-pwa-icons.mjs
 */
import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '..', 'public', 'icons')

function pagerSvg(size, { maskable = false } = {}) {
  const pad = maskable ? size * 0.18 : size * 0.12
  const inner = size - pad * 2
  const stroke = Math.max(2, Math.round(size * 0.045))
  const r = Math.round(inner * 0.08)
  const cx = size / 2
  const cy = size / 2
  const bodyW = inner * 0.55
  const bodyH = inner * 0.72
  const x = cx - bodyW / 2
  const y = cy - bodyH / 2
  const screenY = y + bodyH * 0.14
  const screenH = bodyH * 0.42
  const screenPad = bodyW * 0.12
  const dotR = Math.max(2, size * 0.035)
  const dotY = y + bodyH * 0.72
  const dots = [-1, 0, 1]
    .map((i) => {
      const dx = cx + i * bodyW * 0.22
      return `<circle cx="${dx}" cy="${dotY}" r="${dotR}" fill="#fff"/>`
    })
    .join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#000"/>
  <rect x="${x}" y="${y}" width="${bodyW}" height="${bodyH}" rx="${r}" ry="${r}"
        fill="none" stroke="#fff" stroke-width="${stroke}"/>
  <rect x="${x + screenPad}" y="${screenY}" width="${bodyW - screenPad * 2}" height="${screenH}"
        fill="#fff"/>
  ${dots}
</svg>`
}

async function writePng(filename, size, opts) {
  const svg = Buffer.from(pagerSvg(size, opts))
  const png = await sharp(svg).png().toBuffer()
  await writeFile(path.join(outDir, filename), png)
  console.log(`wrote ${filename} (${size}x${size})`)
}

await mkdir(outDir, { recursive: true })
await writePng('icon-192.png', 192)
await writePng('icon-512.png', 512)
await writePng('maskable-192.png', 192, { maskable: true })
await writePng('maskable-512.png', 512, { maskable: true })
await writePng('apple-touch-icon.png', 180)
console.log('PWA icons ready in public/icons/')
