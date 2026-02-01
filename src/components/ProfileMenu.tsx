'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getCurrentUser, logout } from '@/lib/auth'
import { isFeatureEnabled } from '@/lib/featureFlags'
import { useRouter } from 'next/navigation'
import type { User } from '@/lib/auth'

export default function ProfileMenu() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [showMenu, setShowMenu] = useState(false)

  useEffect(() => {
    if (isFeatureEnabled('PROFILE_AUTH')) {
      setUser(getCurrentUser())
    }
  }, [])

  if (!isFeatureEnabled('PROFILE_AUTH')) {
    return null
  }

  const handleLogout = async () => {
    await logout()
    setUser(null)
    router.push('/calendar')
  }

  if (!user) {
    return (
      <Link
        href="/login"
        className="px-4 py-2 text-sm text-blue-600 hover:underline"
      >
        Login
      </Link>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
      >
        <span>{user.email}</span>
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
          <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded shadow-lg z-20">
            <Link
              href="/profile"
              className="block px-4 py-2 text-sm hover:bg-gray-50"
              onClick={() => setShowMenu(false)}
            >
              Profile
            </Link>
            <button
              onClick={handleLogout}
              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
            >
              Logout
            </button>
          </div>
        </>
      )}
    </div>
  )
}
