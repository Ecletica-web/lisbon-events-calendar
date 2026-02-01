'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useSession, signOut } from 'next-auth/react'

export default function Navigation() {
  const { data: session, status } = useSession()
  const [showMenu, setShowMenu] = useState(false)
  
  const user = session?.user

  return (
    <nav className="bg-slate-900/80 backdrop-blur-xl border-b border-slate-700/50 sticky top-0 z-50 shadow-2xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-14 md:h-16">
          {/* Logo/Title */}
          <div className="flex items-center">
            <Link href="/calendar" className="text-base md:text-xl font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent hover:from-indigo-300 hover:via-purple-300 hover:to-pink-300 transition-all duration-300 drop-shadow-lg">
              <span className="hidden sm:inline">Lisbon Events Calendar</span>
              <span className="sm:hidden">LEC</span>
            </Link>
          </div>

          {/* Navigation Links */}
          <div className="flex items-center gap-1 md:gap-2">
            <Link
              href="/calendar"
              className="text-xs md:text-sm font-medium text-slate-300 hover:text-white px-2 md:px-3 py-1.5 md:py-2 rounded-lg hover:bg-slate-800/80 transition-all duration-200"
            >
              Calendar
            </Link>

            {status === 'loading' ? (
              <div className="text-sm text-slate-400">Loading...</div>
            ) : user ? (
              <>
                <Link
                  href="/profile"
                  className="text-xs md:text-sm font-medium text-slate-300 hover:text-white px-2 md:px-3 py-1.5 md:py-2 rounded-lg hover:bg-slate-800/80 transition-all duration-200"
                >
                  Profile
                </Link>
                <div className="relative">
                  <button
                    onClick={() => setShowMenu(!showMenu)}
                    className="flex items-center gap-1 md:gap-2 text-xs md:text-sm text-slate-300 hover:text-white px-2 md:px-3 py-1.5 md:py-2 rounded-lg hover:bg-slate-800/80 transition-all duration-200"
                  >
                    <span className="text-xs hidden md:inline">{user.email}</span>
                    <span className="text-xs md:hidden">Menu</span>
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>

                  {showMenu && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setShowMenu(false)}
                      />
                      <div className="absolute right-0 mt-2 w-48 bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-xl shadow-2xl z-20 overflow-hidden">
                        <div className="px-4 py-2 text-xs text-slate-400 border-b border-slate-700/50 bg-slate-900/50">
                          {user.email}
                        </div>
                        {user.name && (
                          <div className="px-4 py-2 text-xs text-slate-400 border-b border-slate-700/50 bg-slate-900/50">
                            {user.name}
                          </div>
                        )}
                        <button
                          onClick={async () => {
                            await signOut({ callbackUrl: '/calendar' })
                            setShowMenu(false)
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700/80 transition-colors"
                        >
                          Logout
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-xs md:text-sm font-medium text-slate-300 hover:text-white px-2 md:px-4 py-1.5 md:py-2 rounded-lg hover:bg-slate-800/80 transition-all duration-200"
                >
                  Login
                </Link>
                <Link
                  href="/signup"
                  className="text-xs md:text-sm font-medium text-white bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:via-purple-500 hover:to-pink-500 px-2 md:px-4 py-1.5 md:py-2 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200"
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
