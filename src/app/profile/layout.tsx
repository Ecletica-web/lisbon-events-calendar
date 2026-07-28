export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <div className="sticky top-0 z-[99998] shrink-0 bg-terminus-bg backdrop-blur border-b border-terminus-border safe-area-inset-top">
        <div className="max-w-4xl mx-auto px-4 py-2 flex items-center">
          <a
            href="/calendar"
            className="text-terminus-fg-muted hover:text-terminus-fg text-sm font-medium"
          >
            ← Back to Calendar
          </a>
        </div>
      </div>
      {children}
    </>
  )
}
