'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useSupabaseAuth } from '@/lib/auth/supabaseAuth'
import { FEATURE_FLAGS } from '@/lib/featureFlags'

export default function Navigation() {
  const { data: session, status } = useSession()
  const supabaseAuth = useSupabaseAuth()
  const supabaseUser = supabaseAuth?.user
  const supabaseSignOut = supabaseAuth?.signOut
  const supabaseConfigured = supabaseAuth?.isConfigured ?? false
  const [showMenu, setShowMenu] = useState(false)
  const [showMobileNav, setShowMobileNav] = useState(false)
  const user = supabaseConfigured && supabaseUser
    ? { email: supabaseUser.email, name: supabaseUser.name }
    : session?.user

  const pathname = usePathname()

  // Close mobile nav when resizing to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) setShowMobileNav(false)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Close dropdowns on route change so nav links stay clickable
  useEffect(() => {
    setShowMenu(false)
    setShowMobileNav(false)
  }, [pathname])

  const navLinks = (
    <>
      <Link
        href="/foryou"
        className="block md:inline text-slate-300 hover:text-white px-4 md:px-3 py-3 md:py-2 rounded-lg hover:bg-slate-800/80 transition-all"
        onClick={() => setShowMobileNav(false)}
      >
        For You
      </Link>
      <Link
        href="/calendar"
        className="block md:inline text-slate-300 hover:text-white px-4 md:px-3 py-3 md:py-2 rounded-lg hover:bg-slate-800/80 transition-all"
        onClick={() => setShowMobileNav(false)}
      >
        Calendar
      </Link>
      <Link
        href="/venues"
        className="block md:inline text-slate-300 hover:text-white px-4 md:px-3 py-3 md:py-2 rounded-lg hover:bg-slate-800/80 transition-all"
        onClick={() => setShowMobileNav(false)}
      >
        Venues
      </Link>
      <Link
        href="/promoters"
        className="block md:inline text-slate-300 hover:text-white px-4 md:px-3 py-3 md:py-2 rounded-lg hover:bg-slate-800/80 transition-all"
        onClick={() => setShowMobileNav(false)}
      >
        Promoters
      </Link>
    </>
  )

  return (
    <nav className="relative bg-slate-900/80 backdrop-blur-xl border-b border-slate-700/50 shadow-2xl isolate pointer-events-auto">
      {/* Animated Neon Waves Background */}
      <div className="absolute inset-0 opacity-30 overflow-hidden pointer-events-none">
        {/* Wave 1 - Purple/Indigo */}
        <svg
          className="absolute bottom-0 w-full h-full"
          viewBox="0 0 1200 120"
          preserveAspectRatio="none"
          style={{ animation: 'wave 8s ease-in-out infinite' }}
        >
          <path
            d="M0,60 Q300,20 600,60 T1200,60 L1200,120 L0,120 Z"
            fill="url(#gradient1)"
            opacity="0.6"
          />
          <defs>
            <linearGradient id="gradient1" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.8" />
              <stop offset="50%" stopColor="#a855f7" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#ec4899" stopOpacity="0.8" />
            </linearGradient>
          </defs>
        </svg>
        
        {/* Wave 2 - Pink/Purple */}
        <svg
          className="absolute bottom-0 w-full h-full"
          viewBox="0 0 1200 120"
          preserveAspectRatio="none"
          style={{ animation: 'wave 10s ease-in-out infinite reverse' }}
        >
          <path
            d="M0,80 Q400,40 800,80 T1200,80 L1200,120 L0,120 Z"
            fill="url(#gradient2)"
            opacity="0.5"
          />
          <defs>
            <linearGradient id="gradient2" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ec4899" stopOpacity="0.7" />
              <stop offset="50%" stopColor="#a855f7" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.7" />
            </linearGradient>
          </defs>
        </svg>
        
        {/* Wave 3 - Indigo/Blue */}
        <svg
          className="absolute bottom-0 w-full h-full"
          viewBox="0 0 1200 120"
          preserveAspectRatio="none"
          style={{ animation: 'wave 12s ease-in-out infinite' }}
        >
          <path
            d="M0,100 Q200,60 600,100 T1200,100 L1200,120 L0,120 Z"
            fill="url(#gradient3)"
            opacity="0.4"
          />
          <defs>
            <linearGradient id="gradient3" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.6" />
              <stop offset="50%" stopColor="#6366f1" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.6" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      
      {/* Neon Glow Overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 animate-pulse" />
      
      {/* Animated Neon Particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 rounded-full bg-indigo-400 animate-ping"
            style={{
              left: `${15 + i * 15}%`,
              top: `${20 + (i % 3) * 30}%`,
              animationDelay: `${i * 0.5}s`,
              animationDuration: `${2 + (i % 3)}s`,
              opacity: 0.6,
            }}
          />
        ))}
        {[...Array(4)].map((_, i) => (
          <div
            key={`pink-${i}`}
            className="absolute w-1 h-1 rounded-full bg-pink-400 animate-ping"
            style={{
              left: `${70 + i * 10}%`,
              top: `${30 + (i % 2) * 40}%`,
              animationDelay: `${i * 0.7}s`,
              animationDuration: `${1.5 + (i % 2)}s`,
              opacity: 0.5,
            }}
          />
        ))}
      </div>
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-14 md:h-16 gap-4">
          {/* Logo/Title */}
          <div className="flex items-center flex-shrink-0 min-w-fit pr-2">
            <Link 
              href="/calendar" 
              className="text-base md:text-xl font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent hover:from-indigo-300 hover:via-purple-300 hover:to-pink-300 transition-all duration-300 drop-shadow-lg relative whitespace-nowrap z-10 flex-shrink-0"
              style={{ animation: 'neon-pulse 3s ease-in-out infinite' }}
            >
              <span className="hidden sm:inline">Lisbon Events Calendar</span>
              <span className="sm:hidden">LEC</span>
            </Link>
          </div>

          {/* Navigation Links - Desktop */}
          <div className="hidden md:flex items-center gap-1 md:gap-2">
            {navLinks}
            {FEATURE_FLAGS.PROFILE_AUTH && (status === 'loading' && !supabaseConfigured ? (
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
                        className="fixed top-14 md:top-16 left-0 right-0 bottom-0 z-[60]"
                        onClick={() => setShowMenu(false)}
                        aria-hidden="true"
                      />
                      <div className="absolute right-0 mt-2 w-48 bg-slate-800/95 backdrop-blur-xl border border-slate-700/50 rounded-xl shadow-2xl z-[70] overflow-hidden">
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
                            if (supabaseConfigured && supabaseUser && supabaseSignOut) {
                              await supabaseSignOut()
                              window.location.href = '/calendar'
                            } else {
                              await signOut({ callbackUrl: '/calendar' })
                            }
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
            ))}
          </div>

          {/* Mobile hamburger */}
          <div className="flex md:hidden items-center gap-2">
            {FEATURE_FLAGS.PROFILE_AUTH && (status !== 'loading' || supabaseConfigured) && !user && (
              <>
                <Link
                  href="/login"
                  className="text-xs text-slate-300 hover:text-white px-3 py-2.5 min-h-[44px] flex items-center"
                  onClick={() => setShowMobileNav(false)}
                >
                  Login
                </Link>
                <Link
                  href="/signup"
                  className="text-xs text-white bg-gradient-to-r from-indigo-600 to-purple-600 px-3 py-2.5 min-h-[44px] rounded flex items-center"
                  onClick={() => setShowMobileNav(false)}
                >
                  Sign Up
                </Link>
              </>
            )}
            <button
              onClick={() => setShowMobileNav(!showMobileNav)}
              className="p-3 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/80 touch-manipulation"
              aria-label="Toggle menu"
            >
              {showMobileNav ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile nav dropdown */}
        {showMobileNav && (
          <div className="md:hidden border-t border-slate-700/50 bg-slate-900/95 backdrop-blur-xl">
            <div className="py-3 px-4 space-y-1">
              {navLinks}
              {FEATURE_FLAGS.PROFILE_AUTH && (status === 'loading' && !supabaseConfigured ? (
                <div className="px-4 py-2 text-sm text-slate-400">Loading...</div>
              ) : user ? (
                <>
                  <Link
                    href="/profile"
                    className="block text-slate-300 hover:text-white px-4 py-3 min-h-[44px] flex items-center rounded-lg hover:bg-slate-800/80"
                    onClick={() => setShowMobileNav(false)}
                  >
                    Profile
                  </Link>
                  <button
                    onClick={async () => {
                      if (supabaseConfigured && supabaseUser && supabaseSignOut) {
                        await supabaseSignOut()
                        window.location.href = '/calendar'
                      } else {
                        await signOut({ callbackUrl: '/calendar' })
                      }
                      setShowMobileNav(false)
                    }}
                    className="w-full text-left px-4 py-3 min-h-[44px] text-slate-300 hover:text-white rounded-lg hover:bg-slate-800/80"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="block text-slate-300 hover:text-white px-4 py-3 min-h-[44px] flex items-center rounded-lg hover:bg-slate-800/80"
                    onClick={() => setShowMobileNav(false)}
                  >
                    Login
                  </Link>
                  <Link
                    href="/signup"
                    className="block text-slate-300 hover:text-white px-4 py-3 min-h-[44px] flex items-center rounded-lg hover:bg-slate-800/80"
                    onClick={() => setShowMobileNav(false)}
                  >
                    Sign Up
                  </Link>
                </>
              ))}
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
