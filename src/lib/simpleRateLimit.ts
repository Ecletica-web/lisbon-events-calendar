/**
 * Conservative in-memory rate limit (no external dependency).
 * Best-effort only — resets on process restart.
 */

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

export function checkRateLimit(
  key: string,
  opts: { limit: number; windowMs: number }
): { allowed: boolean; remaining: number } {
  const now = Date.now()
  let bucket = buckets.get(key)
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + opts.windowMs }
    buckets.set(key, bucket)
  }
  if (bucket.count >= opts.limit) {
    return { allowed: false, remaining: 0 }
  }
  bucket.count += 1
  return { allowed: true, remaining: opts.limit - bucket.count }
}

/** Test helper */
export function _resetRateLimitsForTests(): void {
  buckets.clear()
}
