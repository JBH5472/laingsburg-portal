// File: app/teacher/page.js
'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../lib/supabaseClient'

export default function TeacherDashboard() {
  const router = useRouter()
  const pathname = usePathname()

  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  // ─────────────────────────────────────────────────────────────────────────────
  // 1) Fetch the classes this teacher owns, so we can show them in a dropdown
  // ─────────────────────────────────────────────────────────────────────────────
  const [classesList, setClassesList]     = useState([])   // [{ id, name }, …]
  const [selectedClass, setSelectedClass] = useState('')   // uuid of the chosen class

  // ─────────────────────────────────────────────────────────────────────────────
  // 2) Fields for creating a new assignment
  // ─────────────────────────────────────────────────────────────────────────────
  const [title, setTitle]         = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate]     = useState('')

  // ─────────────────────────────────────────────────────────────────────────────
  // 3) The assignments that this teacher has created
  // ─────────────────────────────────────────────────────────────────────────────
  const [assignments, setAssignments] = useState([]) 
  // each item: { id, title, description, due_date, class_id, … }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4) On mount: check auth, verify “teacher” role, fetch classes + assignments
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchUserInfo = async () => {
      // 4a) Who is logged in?
      const { data: authData } = await supabase.auth.getUser()
      const currentUser = authData?.user
      if (!currentUser) {
        // Not logged in → redirect to /login?role=teacher
        router.push('/login?role=teacher')
        return
      }
      setUser(currentUser)

      // 4b) Double‐check this user’s “role” in the users table
      const { data: userInfo, error: roleError } = await supabase
        .from('users')
        .select('role')
        .eq('id', currentUser.id)
        .single()

      if (roleError || !userInfo) {
        console.error('Error fetching user role:', roleError)
        setErrorMsg('Unable to verify your permissions.')
        setLoading(false)
        return
      }
      setRole(userInfo.role)
      if (userInfo.role !== 'teacher') {
        router.push(`/${userInfo.role}`)
        return
      }

      // 4c) Fetch the classes that belong to this teacher
      const { data: classesData, error: classesError } = await supabase
        .from('classes')
        .select('id, name')
        .eq('teacher_id', currentUser.id)
        .order('name', { ascending: true })

      if (classesError) {
        console.error('Error fetching classes:', classesError)
        setErrorMsg('Could not load your classes.')
      } else {
        setClassesList(classesData || [])
        // Optionally pre‐select the first class:
        // if (classesData?.length) setSelectedClass(classesData[0].id)
      }

      // 4d) Fetch assignments that this teacher has created (ordered by due date)
      const { data: assignmentsData, error: assignmentsError } = await supabase
        .from('assignments')
        .select('id, title, description, due_date, class_id')
        .eq('created_by', currentUser.id)
        .order('due_date', { ascending: true })

      if (assignmentsError) {
        console.error('Error fetching assignments:', assignmentsError)
        setErrorMsg('Could not load your assignments.')
      } else {
        setAssignments(assignmentsData || [])
      }

      setLoading(false)
    }

    fetchUserInfo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  // ─────────────────────────────────────────────────────────────────────────────
  // 5) handleCreateAssignment: create a new assignment with the chosen class_id
  // ─────────────────────────────────────────────────────────────────────────────
  const handleCreateAssignment = async (e) => {
    e.preventDefault()
    setErrorMsg('')

    // Must have selected a class, a title, and a due date
    if (!selectedClass) {
      setErrorMsg('Please select a class before creating an assignment.')
      return
    }
    if (!title.trim() || !dueDate) {
      setErrorMsg('Title and due date are required.')
      return
    }

    try {
      // Insert into assignments { title, description, due_date, class_id, created_by }
      const { error } = await supabase.from('assignments').insert({
        title:       title.trim(),
        description: description.trim(),
        due_date:    dueDate,
        class_id:    selectedClass,
        created_by:  user.id,
      })

      if (error) throw error

      // Success: refresh the assignments list
      const { data: newAssignments, error: newError } = await supabase
        .from('assignments')
        .select('id, title, description, due_date, class_id')
        .eq('created_by', user.id)
        .order('due_date', { ascending: true })

      if (newError) {
        console.error('Error reloading assignments:', newError)
        setErrorMsg('Assignment created, but failed to refresh list.')
      } else {
        setAssignments(newAssignments || [])
      }

      // Clear form fields
      setTitle('')
      setDescription('')
      setDueDate('')
      setSelectedClass('')
      setErrorMsg('✅ Assignment created!')
    } catch (err) {
      console.error('Failed to create assignment:', err)
      setErrorMsg('Failed to create assignment. Please try again.')
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6) handleLogout – sign out and redirect to login
  // ─────────────────────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 7) While loading, show a spinner/text
  // ─────────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-blue-900">Loading…</p>
      </main>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 8) Render the teacher dashboard
  // ─────────────────────────────────────────────────────────────────────────────
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
                  href="/teacher/assignments"
                  className={`block px-4 py-2 text-sm font-medium ${
                    pathname === '/teacher/assignments'
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
                    pathname === '/teacher/calendar'
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
           Main Content Area
        ─────────────────────────────────────────────────────────────────────── */}
        <main className="flex-1 p-6 overflow-y-auto bg-blue-50">
          <h1 className="text-2xl font-bold mb-6 text-blue-900">Teacher Dashboard</h1>

          {errorMsg && (
            <div className="mb-4 px-4 py-2 rounded-lg bg-red-100 text-red-700">
              {errorMsg}
            </div>
          )}

          {/* ───────────────────────────────────────────────────────────────────
             8a) Create New Assignment Form
          ─────────────────────────────────────────────────────────────────── */}
          <section className="mb-8">
            <div className="bg-white border border-blue-200 rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-semibold mb-4 text-blue-900">
                Create New Assignment
              </h2>

              <form onSubmit={handleCreateAssignment} className="space-y-4">
                {/* Class Dropdown */}
                <div>
                  <label className="block text-blue-800 font-medium mb-1">
                    Class
                  </label>
                  <select
                    value={selectedClass}
                    onChange={(e) => setSelectedClass(e.target.value)}
                    className="w-full p-2 border border-blue-300 rounded focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">-- Select a Class --</option>
                    {classesList.map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        {cls.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Assignment Title */}
                <div>
                  <label className="block text-blue-800 font-medium mb-1">
                    Assignment Title
                  </label>
                  <input
                    type="text"
                    placeholder="Enter assignment title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full p-2 border border-blue-300 rounded focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-blue-800 font-medium mb-1">
                    Description
                  </label>
                  <textarea
                    placeholder="Enter a brief description (optional)"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full p-2 border border-blue-300 rounded focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    rows={3}
                  ></textarea>
                </div>

                {/* Due Date */}
                <div>
                  <label className="block text-blue-800 font-medium mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full p-2 border border-blue-300 rounded focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-blue-800 hover:bg-blue-900 text-white py-3 rounded-lg font-medium transition-colors duration-150"
                >
                  Create Assignment
                </button>
              </form>
            </div>
          </section>

          {/* ───────────────────────────────────────────────────────────────────
             8b) My Assignments List
          ─────────────────────────────────────────────────────────────────── */}
          <section>
            <h2 className="text-xl font-semibold mb-4 text-blue-900">My Assignments</h2>
            {assignments.length === 0 ? (
              <p className="text-blue-800">You have not created any assignments yet.</p>
            ) : (
              <div className="space-y-4">
                {assignments.map((a) => (
                  <div
                    key={a.id}
                    className="bg-white border border-blue-200 rounded-lg shadow-sm p-4 flex flex-col sm:flex-row sm:justify-between sm:items-center"
                  >
                    <div>
                      <h3 className="font-semibold text-blue-900">
                        {a.title}
                      </h3>
                      <p className="text-sm text-blue-600 mb-1">
                        {a.description ? a.description : <em>No description</em>}
                      </p>
                      <p className="text-sm text-blue-500">
                        Due: {new Date(a.due_date).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="mt-3 sm:mt-0">
                      <Link
                        href={`/teacher/assignments/${a.id}`}
                        className="inline-block bg-blue-800 hover:bg-blue-900 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-150"
                      >
                        View Submissions &amp; Grade
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
         Footer
      ───────────────────────────────────────────────────────────────────────── */}
      <footer className="bg-blue-900 mt-auto">
        <div className="max-w-7xl mx-auto px-4 py-4 text-center text-blue-100 text-sm">
          © {new Date().getFullYear()} Laingsburg Christian School. All rights reserved.
        </div>
      </footer>
    </div>
  )
}
