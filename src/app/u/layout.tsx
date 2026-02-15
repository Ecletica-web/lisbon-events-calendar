export default function PublicProfileLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <div className="sticky top-0 z-[99998] shrink-0 bg-slate-900/95 backdrop-blur border-b border-slate-700/50 safe-area-inset-top">
        <div className="max-w-2xl mx-auto px-4 py-2 flex items-center">
          <a
            href="/calendar"
            className="text-slate-400 hover:text-indigo-400 text-sm font-medium"
          >
            ← Back to Calendar
          </a>
        </div>
      </div>
      {children}
    </>
  )
}
