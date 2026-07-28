export default function PublicProfileLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <div className="sticky top-0 z-[99998] shrink-0 bg-terminus-bg/95 backdrop-blur border-b border-terminus-border safe-area-inset-top">
        <div className="max-w-2xl mx-auto px-4 py-2 flex items-center">
          <a href="/calendar" className="terminus-link text-sm font-medium">
            ← Back to Calendar
          </a>
        </div>
      </div>
      {children}
    </>
  )
}
