import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Animated background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(99,102,241,0.1),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(168,85,247,0.1),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_80%,rgba(236,72,153,0.1),transparent_50%)]" />
      </div>
      
      <div className="text-center relative z-10 px-4">
        <div className="mb-8">
          <h1 className="text-6xl md:text-8xl font-extrabold mb-6 bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent drop-shadow-2xl animate-pulse">
            Lisbon Events
          </h1>
          <h2 className="text-3xl md:text-5xl font-bold text-slate-300 mb-2">
            Calendar
          </h2>
          <p className="text-lg md:text-xl text-slate-400 mt-4 max-w-2xl mx-auto">
            Discover the best cultural events in Lisbon
          </p>
        </div>
        
        <Link 
          href="/calendar" 
          className="inline-block group relative"
        >
          <div className="absolute -inset-1 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 rounded-2xl blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-pulse" />
          <div className="relative px-8 py-4 bg-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-2xl">
            <span className="text-lg md:text-xl font-semibold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              View Calendar →
            </span>
          </div>
        </Link>
      </div>
    </main>
  )
}
