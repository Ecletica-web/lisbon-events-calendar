/**
 * Generate color shades for events in the same category on the same day
 */

/**
 * Convert hex color to HSL
 */
function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6
        break
      case g:
        h = ((b - r) / d + 2) / 6
        break
      case b:
        h = ((r - g) / d + 4) / 6
        break
    }
  }

  return [h * 360, s * 100, l * 100]
}

/**
 * Convert HSL to hex
 */
function hslToHex(h: number, s: number, l: number): string {
  l /= 100
  const a = (s * Math.min(l, 1 - l)) / 100
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

/**
 * Generate a shade of a color
 * @param baseColor - Base hex color
 * @param index - Index of the shade (0 = base, 1 = lighter, 2 = darker, etc.)
 * @param total - Total number of shades needed
 */
export function generateColorShade(baseColor: string, index: number, total: number): string {
  if (total <= 1) return baseColor

  const [h, s, l] = hexToHsl(baseColor)
  
  // Create variations by adjusting lightness
  // Base color is at index 0
  // Alternate between lighter and darker shades
  const variation = (index % 2 === 0 ? 1 : -1) * Math.floor((index + 1) / 2) * 8
  const newL = Math.max(20, Math.min(80, l + variation))
  
  // Slightly adjust saturation for variety
  const newS = Math.max(30, Math.min(100, s + (index % 3 - 1) * 5))
  
  return hslToHex(h, newS, newL)
}
