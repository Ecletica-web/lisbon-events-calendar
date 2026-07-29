/**
 * Short square-wave blips for terminal / Pokemon-style text typing.
 * Uses Web Audio so we don't ship audio assets.
 */

let sharedCtx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  if (!sharedCtx) sharedCtx = new AC()
  return sharedCtx
}

/** Call from a user gesture so autoplay policies allow sound. */
export async function unlockTypingAudio(): Promise<void> {
  const ctx = getCtx()
  if (!ctx) return
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume()
    } catch {
      // ignore
    }
  }
}

/** One soft square blip (Pokemon text tick). */
export function playTypingBeep(opts?: { pitch?: number; volume?: number }): void {
  const ctx = getCtx()
  if (!ctx || ctx.state !== 'running') return

  const pitch = opts?.pitch ?? 920
  const volume = opts?.volume ?? 0.045
  const now = ctx.currentTime

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'square'
  osc.frequency.setValueAtTime(pitch, now)
  gain.gain.setValueAtTime(volume, now)
  gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.045)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.05)
}
