// File: /components/CalendarLayout.jsx
'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../lib/supabaseClient'

export default function CalendarLayout({ children }) {
  const router   = useRouter()
  const pathname = usePathname()

  // We fetch the current user here just so that we can let them logout.
  const [user, setUser]       = useState(null)
  const [loadingUser, setLoadingUser] = useState(true)

  useEffect(() => {
    async function fetchUser() {
      const {
        data: { user: currentUser },
        error,
      } = await supabase.auth.getUser()
      if (error || !currentUser) {
        // If not logged in, send them to /login
        router.push('/login?role=teacher')
        return
      }
      setUser(currentUser)
      setLoadingUser(false)
    }
    fetchUser()
  }, [router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // While we’re verifying the user’s session, don’t show anything:
  if (loadingUser) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-blue-900">Loading…</p>
      </main>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* ─────────────────────────────────────────────────────────────────────────
         Top Navigation Bar
      ───────────────────────────────────────────────────────────────────────── */}
      <header className="bg-blue-900">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center space-x-2">
            <img
              src="/CircleLogo2.png"
              alt="Laingsburg Christian Logo"
              className="h-10 w-auto"
              onError={(e) => {
                // if logo fails to load, silently hide it
                e.currentTarget.style.display = 'none'
              }}
            />
            <span className="text-white text-xl font-semibold">LCS Portal</span>
          </div>
          {/* Top links */}
          <nav className="flex items-center space-x-6">
            <Link
              href="/teacher"
              className={`text-sm font-medium ${
                pathname === '/teacher'
                  ? 'text-blue-100'
                  : 'text-blue-300 hover:text-blue-100'
              }`}
            >
              Dashboard
            </Link>
            <Link
              href="/"
              className="text-sm font-medium text-blue-300 hover:text-blue-100"
            >
              Home
            </Link>
            <button
              onClick={handleLogout}
              className="text-sm font-medium text-red-300 hover:text-red-100"
            >
              Logout
            </button>
          </nav>
        </div>
      </header>

      <div className="flex flex-1">
        {/* ───────────────────────────────────────────────────────────────────────
           Left Sidebar (Small Navigation Pane)
        ─────────────────────────────────────────────────────────────────────── */}
        <aside className="w-60 bg-blue-100 border-r border-blue-200">
          <nav className="mt-6">
            <ul>
              <li>
                <Link
                  href="/teacher"
                  className={`block px-4 py-2 text-sm font-medium ${
                    pathname === '/teacher'
                      ? 'bg-white text-blue-900'
                      : 'text-blue-800 hover:bg-white hover:text-blue-900'
                  }`}
                >
                  Dashboard
                </Link>
              </li>
              <li>
                <Link
                  href="/teacher"
                  className={`block px-4 py-2 text-sm font-medium ${
                    pathname === '/teacher'
                      ? 'bg-white text-blue-900'
                      : 'text-blue-800 hover:bg-white hover:text-blue-900'
                  }`}
                >
                  My Assignments
                </Link>
              </li>
              <li>
                <Link
                  href="/teacher/calendar"
                  className={`block px-4 py-2 text-sm font-medium ${
                    pathname?.startsWith('/teacher/calendar')
                      ? 'bg-white text-blue-900'
                      : 'text-blue-800 hover:bg-white hover:text-blue-900'
                  }`}
                >
                  Calendar
                </Link>
              </li>
              <li>
                <a
                  href="https://www.laingsburgchristian.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-4 py-2 text-sm font-medium text-blue-800 hover:bg-white hover:text-blue-900"
                >
                  School Website
                </a>
              </li>
              <li>
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-2 text-sm font-medium text-red-600 hover:bg-white hover:text-red-800"
                >
                  Logout
                </button>
              </li>
            </ul>
          </nav>
        </aside>

        {/* ───────────────────────────────────────────────────────────────────────
           Main Content Area (children)
        ─────────────────────────────────────────────────────────────────────── */}
        <main className="flex-1 p-6 overflow-y-auto bg-blue-50">{children}</main>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
         Footer
      ───────────────────────────────────────────────────────────────────────── */}
      <footer className="bg-blue-900 mt-auto">
        <div className="max-w-7xl mx-auto px-4 py-4 text-center text-blue-100 text-sm">
          © {new Date().getFullYear()} Laingsburg Christian School. All rights
          reserved.
        </div>
      </footer>
    </div>
  )
}
