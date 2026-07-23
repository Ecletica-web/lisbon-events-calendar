export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <div className="sticky top-0 z-[99998] shrink-0 bg-pager-bg backdrop-blur border-b border-pager-border safe-area-inset-top">
        <div className="max-w-4xl mx-auto px-4 py-2 flex items-center">
          <a
            href="/calendar"
            className="text-pager-fg-muted hover:text-indigo-400 text-sm font-medium"
          >
            ← Back to Calendar
          </a>
        </div>
      </div>
      {children}
    </>
  )
}
