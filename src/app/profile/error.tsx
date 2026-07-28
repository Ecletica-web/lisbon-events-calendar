'use client'

export default function ProfileError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen bg-terminus-bg text-terminus-fg flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <h2 className="font-pixel text-[10px] sm:text-xs text-terminus-fg">{'> ERROR'}</h2>
        <p className="text-terminus-fg-muted text-sm">{error.message}</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center flex-wrap">
          <a
            href="/calendar"
            className="terminus-btn terminus-btn-primary px-4 py-2.5 text-xs uppercase tracking-wider text-center"
          >
            Back to Calendar
          </a>
          <a
            href="/profile"
            className="terminus-btn px-4 py-2.5 text-xs uppercase tracking-wider text-center"
          >
            Reload profile
          </a>
          <button
            onClick={reset}
            className="terminus-btn terminus-btn-ghost px-4 py-2.5 text-xs uppercase tracking-wider"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  )
}
