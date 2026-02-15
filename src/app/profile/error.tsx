'use client'

import Link from 'next/link'

export default function ProfileError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <h2 className="text-xl font-semibold text-white">Something went wrong on your profile</h2>
        <p className="text-slate-400 text-sm">{error.message}</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/calendar"
            className="px-4 py-2.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-500 transition-colors"
          >
            Back to Calendar
          </Link>
          <button
            onClick={reset}
            className="px-4 py-2.5 rounded-lg bg-slate-700 text-slate-200 font-medium hover:bg-slate-600 transition-colors"
          >
            Try again
          </button>
          <Link
            href="/profile"
            className="px-4 py-2.5 rounded-lg border border-slate-600 text-slate-300 font-medium hover:bg-slate-800 transition-colors"
          >
            Reload profile
          </Link>
        </div>
      </div>
    </div>
  )
}
