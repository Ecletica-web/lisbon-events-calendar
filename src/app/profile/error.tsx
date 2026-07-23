'use client'

export default function ProfileError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen bg-pager-bg text-pager-fg flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <h2 className="text-xl font-semibold text-white">Something went wrong on your profile</h2>
        <p className="text-pager-fg-muted text-sm">{error.message}</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center flex-wrap">
          <a
            href="/calendar"
            className="px-4 py-2.5 rounded-none bg-indigo-600 text-white font-medium hover:bg-indigo-500 transition-colors text-center"
          >
            Back to Calendar
          </a>
          <a
            href="/profile"
            className="px-4 py-2.5 rounded-none border border-pager-border text-pager-fg-muted font-medium hover:bg-pager-elevated transition-colors text-center"
          >
            Reload profile
          </a>
          <button
            onClick={reset}
            className="px-4 py-2.5 rounded-none bg-pager-muted text-pager-fg font-medium hover:bg-slate-600 transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  )
}
