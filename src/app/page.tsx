import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Lisbon Events Calendar</h1>
        <Link 
          href="/calendar" 
          className="text-blue-600 hover:underline text-lg"
        >
          View Calendar →
        </Link>
      </div>
    </main>
  )
}
