'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export default function ParentDashboard() {
  const [user, setUser] = useState(null)

  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser()
      if (data?.user) setUser(data.user)
    }
    getUser()
  }, [])

  return (
    <main className="min-h-screen bg-white dark:bg-gray-900 text-black dark:text-white flex flex-col items-center justify-center">
      <h1 className="text-2xl font-bold mb-4">Parent Dashboard</h1>
      {user ? <p>Welcome, {user.email}!</p> : <p>Loading user info...</p>}
    </main>
  )
}
