'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useSupabaseAuth } from '@/lib/auth/supabaseAuth'
import { FEATURE_FLAGS } from '@/lib/featureFlags'
import InviteToAppButton from '@/components/InviteToAppButton'
import ThemeToggle from '@/components/ThemeToggle'

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
    `block md:inline px-3 py-2.5 md:py-1.5 text-xs uppercase tracking-wider border-2 transition-none ${
      isActive(href)
        ? 'bg-pager-accent text-pager-accent-fg border-pager-strong'
        : 'text-pager-fg border-transparent hover:border-pager-strong hover:bg-pager-muted'
    }`

  const links = [
    { href: '/foryou', label: 'For You' },
    { href: '/calendar', label: 'Calendar' },
    { href: '/chat', label: 'Chat' },
    { href: '/venues', label: 'Venues' },
    { href: '/promoters', label: 'Promoters' },
  ]

  const navLinks = links.map(({ href, label }) =>
    isProfilePage ? (
      <a key={href} href={href} className={navLinkClass(href)} onClick={closeMenus}>
        {label}
      </a>
    ) : (
      <Link key={href} href={href} className={navLinkClass(href)} onClick={closeMenus}>
        {label}
      </Link>
    )
  )

  const brandClass =
    'font-pixel text-[10px] sm:text-xs text-pager-fg hover:opacity-80 whitespace-nowrap pager-cursor'

  return (
    <nav className="relative bg-pager-elevated border-b-2 border-pager-strong isolate pointer-events-auto">
      <div className="relative max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="relative z-[80] flex justify-between items-center h-14 md:h-16 gap-3">
          <div className="flex items-center flex-shrink-0 min-w-fit pr-2">
            {isProfilePage ? (
              <a href="/calendar" className={brandClass}>
                PAGER
              </a>
            ) : (
              <Link href="/calendar" className={brandClass}>
                PAGER
              </Link>
            )}
          </div>

          <div className="hidden md:flex items-center gap-1">
            {navLinks}
            <ThemeToggle className="ml-2" />
            {FEATURE_FLAGS.PROFILE_AUTH &&
              (status === 'loading' && !supabaseConfigured ? (
                <div className="text-xs text-pager-fg-muted px-2">...</div>
              ) : user ? (
                <>
                  <Link
                    href="/profile"
                    className={`relative ${navLinkClass('/profile')}`}
                    onClick={closeMenus}
                  >
                    Profile
                    {notificationCount > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 flex items-center justify-center text-[9px] font-bold bg-pager-accent text-pager-accent-fg border border-pager-strong">
                        {notificationCount > 99 ? '99+' : notificationCount}
                      </span>
                    )}
                  </Link>
                  <div className="relative">
                    <button
                      onClick={() => setShowMenu(!showMenu)}
                      className="pager-btn pager-btn-ghost text-[10px] uppercase tracking-wider px-2 py-1.5"
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
                        <div className="absolute right-0 mt-2 w-52 pager-panel z-[70] overflow-hidden">
                          <div className="px-3 py-2 text-[10px] text-pager-fg-muted border-b-2 border-pager-border">
                            {user.email}
                          </div>
                          {user.name && (
                            <div className="px-3 py-2 text-[10px] text-pager-fg-muted border-b-2 border-pager-border">
                              {user.name}
                            </div>
                          )}
                          <div className="px-2 py-2 border-b-2 border-pager-border">
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
                            className="w-full text-left px-3 py-2 text-xs uppercase tracking-wider text-pager-fg hover:bg-pager-muted"
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
                    Login
                  </Link>
                  <Link href="/signup" className="pager-btn pager-btn-primary text-[10px] uppercase tracking-wider px-3 py-1.5 ml-1">
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
                className="text-[10px] uppercase tracking-wider text-pager-fg px-2 py-2"
                onClick={closeMenus}
              >
                Login
              </Link>
            )}
            <button
              onClick={() => setShowMobileNav(!showMobileNav)}
              className="pager-btn pager-btn-ghost p-2 min-h-[44px] min-w-[44px]"
              aria-label="Toggle menu"
            >
              {showMobileNav ? '✕' : '☰'}
            </button>
          </div>
        </div>

        {showMobileNav && (
          <div className="md:hidden border-t-2 border-pager-strong bg-pager-elevated">
            <div className="py-2 px-2 space-y-1">
              {navLinks}
              {FEATURE_FLAGS.PROFILE_AUTH &&
                (status === 'loading' && !supabaseConfigured ? (
                  <div className="px-3 py-2 text-xs text-pager-fg-muted">...</div>
                ) : user ? (
                  <>
                    <Link
                      href="/profile"
                      className={navLinkClass('/profile')}
                      onClick={closeMenus}
                    >
                      Profile
                      {notificationCount > 0 && (
                        <span className="ml-2 text-[10px] bg-pager-accent text-pager-accent-fg px-1">
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
                      className="w-full text-left px-3 py-3 text-xs uppercase tracking-wider text-pager-fg hover:bg-pager-muted"
                    >
                      Logout
                    </button>
                  </>
                ) : (
                  <>
                    <Link href="/login" className={navLinkClass('/login')} onClick={closeMenus}>
                      Login
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
