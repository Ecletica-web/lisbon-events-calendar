'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useSession, signOut } from 'next-auth/react'

export default function Navigation() {
  const { data: session, status } = useSession()
  const [showMenu, setShowMenu] = useState(false)
  
  const user = session?.user

  return (
    <nav className="bg-white/90 backdrop-blur-md border-b border-gray-200/50 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-14 md:h-16">
          {/* Logo/Title */}
          <div className="flex items-center">
            <Link href="/calendar" className="text-base md:text-xl font-bold bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 bg-clip-text text-transparent hover:from-blue-600 hover:via-purple-600 hover:to-blue-600 transition-all duration-300">
              <span className="hidden sm:inline">Lisbon Events Calendar</span>
              <span className="sm:hidden">LEC</span>
            </Link>
          </div>

          {/* Navigation Links */}
          <div className="flex items-center gap-1 md:gap-2">
            <Link
              href="/calendar"
              className="text-xs md:text-sm font-medium text-gray-700 hover:text-gray-900 px-2 md:px-3 py-1.5 md:py-2 rounded-lg hover:bg-gray-100/80 transition-all duration-200"
            >
              Calendar
            </Link>

            {status === 'loading' ? (
              <div className="text-sm text-gray-500">Loading...</div>
            ) : user ? (
              <>
                <Link
                  href="/profile"
                  className="text-xs md:text-sm font-medium text-gray-700 hover:text-gray-900 px-2 md:px-3 py-1.5 md:py-2 rounded-lg hover:bg-gray-100/80 transition-all duration-200"
                >
                  Profile
                </Link>
                <div className="relative">
                  <button
                    onClick={() => setShowMenu(!showMenu)}
                    className="flex items-center gap-1 md:gap-2 text-xs md:text-sm text-gray-700 hover:text-gray-900 px-2 md:px-3 py-1.5 md:py-2 rounded-lg hover:bg-gray-100/80 transition-all duration-200"
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
                      <div className="absolute right-0 mt-2 w-48 bg-white/95 backdrop-blur-md border border-gray-200/50 rounded-xl shadow-xl z-20 overflow-hidden">
                        <div className="px-4 py-2 text-xs text-gray-500 border-b border-gray-200/50 bg-gray-50/50">
                          {user.email}
                        </div>
                        {user.name && (
                          <div className="px-4 py-2 text-xs text-gray-500 border-b border-gray-200/50 bg-gray-50/50">
                            {user.name}
                          </div>
                        )}
                        <button
                          onClick={async () => {
                            await signOut({ callbackUrl: '/calendar' })
                            setShowMenu(false)
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100/80 transition-colors"
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
                  className="text-xs md:text-sm font-medium text-gray-700 hover:text-gray-900 px-2 md:px-4 py-1.5 md:py-2 rounded-lg hover:bg-gray-100/80 transition-all duration-200"
                >
                  Login
                </Link>
                <Link
                  href="/signup"
                  className="text-xs md:text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 px-2 md:px-4 py-1.5 md:py-2 rounded-lg shadow-md hover:shadow-lg transition-all duration-200"
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
