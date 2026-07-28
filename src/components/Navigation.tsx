'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect, type ReactNode } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useSupabaseAuth } from '@/lib/auth/supabaseAuth'
import { FEATURE_FLAGS } from '@/lib/featureFlags'
import InviteToAppButton from '@/components/InviteToAppButton'
import ThemeToggle from '@/components/ThemeToggle'

function NavIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="square"
      strokeLinejoin="miter"
      className="inline-block shrink-0"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

const ICONS: Record<string, ReactNode> = {
  foryou: (
    <NavIcon>
      <path d="M12 3l2.2 6.8H21l-5.5 4 2.1 6.7L12 16.8 6.4 20.5l2.1-6.7L3 9.8h6.8L12 3z" />
    </NavIcon>
  ),
  calendar: (
    <NavIcon>
      <rect x="3" y="5" width="18" height="16" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </NavIcon>
  ),
  chat: (
    <NavIcon>
      <path d="M4 5h16v11H8l-4 3V5z" />
    </NavIcon>
  ),
  venues: (
    <NavIcon>
      <path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </NavIcon>
  ),
  promoters: (
    <NavIcon>
      <path d="M4 10v4l12 3V7L4 10z" />
      <path d="M16 9.5c2 1 2 4 0 5" />
      <path d="M9 17v3" />
    </NavIcon>
  ),
  profile: (
    <NavIcon>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5" />
    </NavIcon>
  ),
  login: (
    <NavIcon>
      <path d="M14 4h6v16h-6" />
      <path d="M10 12H3M7 9l-3 3 3 3" />
    </NavIcon>
  ),
}

export default function Navigation() {
  const { data: session, status } = useSession()
  const supabaseAuth = useSupabaseAuth()
  const supabaseUser = supabaseAuth?.user
  const supabaseSignOut = supabaseAuth?.signOut
  const supabaseConfigured = supabaseAuth?.isConfigured ?? false
  const [showMenu, setShowMenu] = useState(false)
  const [showMobileNav, setShowMobileNav] = useState(false)
  const [notificationCount, setNotificationCount] = useState(0)
  const user =
    supabaseConfigured && supabaseUser
      ? { email: supabaseUser.email, name: supabaseUser.name }
      : session?.user

  const pathname = usePathname()
  const isProfilePage =
    pathname === '/profile' || pathname.startsWith('/profile/') || pathname.startsWith('/u/')

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) setShowMobileNav(false)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    setShowMenu(false)
    setShowMobileNav(false)
  }, [pathname])

  useEffect(() => {
    if (!supabaseConfigured || !supabaseUser) {
      setNotificationCount(0)
      return
    }
    async function fetchCount() {
      try {
        const { supabase } = await import('@/lib/supabase/client')
        const {
          data: { session },
        } = await (supabase?.auth.getSession() ?? { data: { session: null } })
        if (!session?.access_token) return
        const res = await fetch('/api/notifications/count', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (res.ok) {
          const { count } = await res.json()
          setNotificationCount(count ?? 0)
        }
      } catch {
        setNotificationCount(0)
      }
    }
    fetchCount()
  }, [supabaseConfigured, supabaseUser, pathname])

  const closeMenus = () => {
    setShowMenu(false)
    setShowMobileNav(false)
  }

  const isActive = (href: string) =>
    pathname === href || (href !== '/' && pathname.startsWith(href + '/'))

  const navLinkClass = (href: string) =>
    `flex md:inline-flex items-center gap-1.5 px-3 py-2.5 md:py-1.5 text-xs uppercase tracking-wider border-2 transition-none ${
      isActive(href)
        ? 'bg-terminus-accent text-terminus-accent-fg border-terminus-strong'
        : 'text-terminus-fg border-transparent hover:border-terminus-strong hover:bg-terminus-muted'
    }`

  const links: { href: string; label: string; icon: keyof typeof ICONS }[] = [
    { href: '/foryou', label: 'For You', icon: 'foryou' },
    { href: '/calendar', label: 'Calendar', icon: 'calendar' },
    { href: '/chat', label: 'Chat', icon: 'chat' },
    { href: '/venues', label: 'Venues', icon: 'venues' },
    { href: '/promoters', label: 'Promoters', icon: 'promoters' },
  ]

  const navLinks = links.map(({ href, label, icon }) => {
    const content = (
      <>
        {ICONS[icon]}
        <span>{label}</span>
      </>
    )
    return isProfilePage ? (
      <a key={href} href={href} className={navLinkClass(href)} onClick={closeMenus}>
        {content}
      </a>
    ) : (
      <Link key={href} href={href} className={navLinkClass(href)} onClick={closeMenus}>
        {content}
      </Link>
    )
  })

  const brandClass =
    'font-pixel text-[10px] sm:text-xs text-terminus-fg hover:opacity-80 whitespace-nowrap terminus-cursor'

  return (
    <nav className="relative bg-terminus-elevated border-b-2 border-terminus-strong isolate pointer-events-auto">
      <div className="relative max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="relative z-[80] flex justify-between items-center h-14 md:h-16 gap-3">
          <div className="flex items-center flex-shrink-0 min-w-fit pr-2">
            {isProfilePage ? (
              <a href="/calendar" className={brandClass}>
                <span className="hidden sm:inline">TERMINUS</span>
                <span className="sm:hidden">TM</span>
              </a>
            ) : (
              <Link href="/calendar" className={brandClass}>
                <span className="hidden sm:inline">TERMINUS</span>
                <span className="sm:hidden">TM</span>
              </Link>
            )}
          </div>

          <div className="hidden md:flex items-center gap-1">
            {navLinks}
            <ThemeToggle className="ml-2" />
            {FEATURE_FLAGS.PROFILE_AUTH &&
              (status === 'loading' && !supabaseConfigured ? (
                <div className="text-xs text-terminus-fg-muted px-2">...</div>
              ) : user ? (
                <>
                  <Link
                    href="/profile"
                    className={`relative ${navLinkClass('/profile')}`}
                    onClick={closeMenus}
                  >
                    {ICONS.profile}
                    <span>Profile</span>
                    {notificationCount > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 flex items-center justify-center text-[9px] font-bold bg-terminus-accent text-terminus-accent-fg border border-terminus-strong">
                        {notificationCount > 99 ? '99+' : notificationCount}
                      </span>
                    )}
                  </Link>
                  <div className="relative">
                    <button
                      onClick={() => setShowMenu(!showMenu)}
                      className="terminus-btn terminus-btn-ghost text-[10px] uppercase tracking-wider px-2 py-1.5"
                    >
                      <span className="hidden lg:inline max-w-[140px] truncate">{user.email}</span>
                      <span className="lg:hidden">Menu</span>
                      <span aria-hidden>▼</span>
                    </button>

                    {showMenu && (
                      <>
                        <div
                          className="fixed top-14 md:top-16 left-0 right-0 bottom-0 z-[60]"
                          onClick={() => setShowMenu(false)}
                          aria-hidden="true"
                        />
                        <div className="absolute right-0 mt-2 w-52 terminus-panel z-[70] overflow-hidden">
                          <div className="px-3 py-2 text-[10px] text-terminus-fg-muted border-b-2 border-terminus-border">
                            {user.email}
                          </div>
                          {user.name && (
                            <div className="px-3 py-2 text-[10px] text-terminus-fg-muted border-b-2 border-terminus-border">
                              {user.name}
                            </div>
                          )}
                          <div className="px-2 py-2 border-b-2 border-terminus-border">
                            <InviteToAppButton
                              variant="button"
                              className="w-full justify-center"
                              onAfterClick={() => setShowMenu(false)}
                            />
                          </div>
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
                            className="w-full text-left px-3 py-2 text-xs uppercase tracking-wider text-terminus-fg hover:bg-terminus-muted"
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
                  <Link href="/login" className={navLinkClass('/login')}>
                    {ICONS.login}
                    <span>Login</span>
                  </Link>
                  <Link href="/signup" className="terminus-btn terminus-btn-primary text-[10px] uppercase tracking-wider px-3 py-1.5 ml-1">
                    Sign Up
                  </Link>
                </>
              ))}
          </div>

          <div className="flex md:hidden items-center gap-1">
            <ThemeToggle />
            {FEATURE_FLAGS.PROFILE_AUTH && (status !== 'loading' || supabaseConfigured) && !user && (
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-terminus-fg px-2 py-2"
                onClick={closeMenus}
              >
                {ICONS.login}
                <span>Login</span>
              </Link>
            )}
            <button
              onClick={() => setShowMobileNav(!showMobileNav)}
              className="terminus-btn terminus-btn-ghost p-2 min-h-[44px] min-w-[44px]"
              aria-label="Toggle menu"
            >
              {showMobileNav ? '✕' : '☰'}
            </button>
          </div>
        </div>

        {showMobileNav && (
          <div className="md:hidden border-t-2 border-terminus-strong bg-terminus-elevated">
            <div className="py-2 px-2 space-y-1">
              {navLinks}
              {FEATURE_FLAGS.PROFILE_AUTH &&
                (status === 'loading' && !supabaseConfigured ? (
                  <div className="px-3 py-2 text-xs text-terminus-fg-muted">...</div>
                ) : user ? (
                  <>
                    <Link
                      href="/profile"
                      className={navLinkClass('/profile')}
                      onClick={closeMenus}
                    >
                      {ICONS.profile}
                      <span>Profile</span>
                      {notificationCount > 0 && (
                        <span className="ml-1 text-[10px] bg-terminus-accent text-terminus-accent-fg px-1">
                          {notificationCount > 99 ? '99+' : notificationCount}
                        </span>
                      )}
                    </Link>
                    <div className="px-2 py-2">
                      <InviteToAppButton
                        variant="button"
                        className="w-full justify-center"
                        onAfterClick={closeMenus}
                      />
                    </div>
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
                      className="w-full text-left px-3 py-3 text-xs uppercase tracking-wider text-terminus-fg hover:bg-terminus-muted"
                    >
                      Logout
                    </button>
                  </>
                ) : (
                  <>
                    <Link href="/login" className={navLinkClass('/login')} onClick={closeMenus}>
                      {ICONS.login}
                      <span>Login</span>
                    </Link>
                    <Link href="/signup" className={navLinkClass('/signup')} onClick={closeMenus}>
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
