// File: app/teacher/assignments/[id]/page.js
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../../../lib/supabaseClient'

export default function ViewSubmissions() {
  const { id } = useParams()              // assignment_id from the URL
  const router = useRouter()
  const pathname = usePathname()

  const [user, setUser] = useState(null)
  const [submissions, setSubmissions] = useState([])
  const [nameMap, setNameMap] = useState({}) // { student_id: full_name, ... }
  const [loading, setLoading] = useState(true)
  const [savingGradeId, setSavingGradeId] = useState(null)
  const [deletingSubId, setDeletingSubId] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')

  // ──────────────────────────────────────────────────────────────────────
  // 1) Check authentication & role, then fetch submissions
  // ──────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const checkAuthAndLoad = async () => {
      // 1a) Who is logged in?
      const { data: authData } = await supabase.auth.getUser()
      const currentUser = authData?.user
      if (!currentUser) {
        router.push('/login?role=teacher')
        return
      }
      setUser(currentUser)

      // 1b) Verify role from 'users' table
      const { data: userInfo, error: roleError } = await supabase
        .from('users')
        .select('role')
        .eq('id', currentUser.id)
        .single()

      if (roleError || !userInfo) {
        console.error('Error fetching user role:', roleError)
        return
      }
      if (userInfo.role !== 'teacher') {
        router.push(`/${userInfo.role}`)
        return
      }

      // 1c) Fetch submissions for this assignment
      fetchSubmissionsAndNames()
    }

    checkAuthAndLoad()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // ──────────────────────────────────────────────────────────────────────
  // 2) Fetch submissions + student names
  // ──────────────────────────────────────────────────────────────────────
  const fetchSubmissionsAndNames = async () => {
    setLoading(true)
    setErrorMsg('')

    // A) Get all submissions for this assignment_id
    let subsData = []
    {
      const { data, error } = await supabase
        .from('submissions')
        .select('*')
        .eq('assignment_id', id)
        .order('submitted_at', { ascending: false })

      if (error) {
        console.error('Error fetching submissions:', error)
        setErrorMsg('Could not load submissions.')
        setLoading(false)
        return
      }
      subsData = data || []
    }

    // If none exist, clear state and bail out
    if (!subsData.length) {
      setSubmissions([])
      setNameMap({})
      setLoading(false)
      return
    }

    // B) Collect unique student IDs
    const uniqueIds = Array.from(new Set(subsData.map((s) => s.student_id)))

    // C) Fetch full_name for those IDs
    let usersData = []
    {
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name')
        .in('id', uniqueIds)

      if (error) {
        console.error('Error fetching user names:', error)
      } else {
        usersData = data || []
      }
    }

    // D) Build nameMap
    const map = {}
    usersData.forEach((u) => {
      map[u.id] = u.full_name
    })

    setSubmissions(subsData)
    setNameMap(map)
    setLoading(false)
  }

  // ──────────────────────────────────────────────────────────────────────
  // 3) Save grade
  // ──────────────────────────────────────────────────────────────────────
  const handleSaveGrade = async (submissionId, newGrade) => {
    setSavingGradeId(submissionId)
    setErrorMsg('')

    const { error } = await supabase
      .from('submissions')
      .update({ grade: newGrade })
      .eq('id', submissionId)

    if (error) {
      console.error('Error saving grade:', error)
      setErrorMsg('Failed to save grade. Please try again.')
      setSavingGradeId(null)
      return
    }

    await fetchSubmissionsAndNames()
    setSavingGradeId(null)
  }

  // ──────────────────────────────────────────────────────────────────────
  // 4) Delete submission
  // ──────────────────────────────────────────────────────────────────────
  const handleDeleteSubmission = async (submission) => {
    if (
      !window.confirm(
        'Delete this submission? The uploaded file remains in storage unless you delete it manually.'
      )
    ) {
      return
    }
    setDeletingSubId(submission.id)

    try {
      const { error } = await supabase
        .from('submissions')
        .delete()
        .eq('id', submission.id)

      if (error) throw error

      await fetchSubmissionsAndNames()
    } catch (err) {
      console.error('Error deleting submission:', err)
      alert('Failed to delete submission. Please try again.')
    } finally {
      setDeletingSubId(null)
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // 5) Logout
  // ──────────────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // ──────────────────────────────────────────────────────────────────────
  // 6) Loading indicator
  // ──────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-blue-800">Loading submissions…</p>
      </main>
    )
  }

  // Split into “ungraded” vs. “graded”
  const ungraded = submissions.filter((s) => s.grade === null)
  const graded = submissions.filter((s) => s.grade !== null)

  return (
    <div className="min-h-screen flex bg-white">
      {/* ───────────────────────────────────────────────────────────────────
         Left Sidebar (with active highlight)
      ─────────────────────────────────────────────────────────────────── */}
      <aside className="w-60 bg-white border-r">
        <div className="px-4 py-6 flex items-center space-x-2">
          <img
            src="/CircleLogo2.png"
            alt="Laingsburg Christian Logo"
            className="h-10 w-auto"
          />
          <span className="text-lg font-semibold text-blue-800">LCS Portal</span>
        </div>
        <nav className="mt-4">
          <ul>
            <li>
              <Link
                href="/teacher"
                className={`block px-4 py-3 text-sm font-medium ${
                  pathname === '/teacher'
                    ? 'bg-blue-100 text-blue-800'
                    : 'text-gray-700 hover:bg-blue-100 hover:text-blue-800'
                }`}
              >
                Dashboard
              </Link>
            </li>
            <li>
              <Link
                href="/teacher"
                className={`block px-4 py-3 text-sm font-medium ${
                  pathname === '/teacher'
                    ? 'bg-blue-100 text-blue-800'
                    : 'text-gray-700 hover:bg-blue-100 hover:text-blue-800'
                }`}
              >
                My Assignments
              </Link>
            </li>
            <li>
              <Link
                href={`/teacher/assignments/${id}`}
                className={`block px-4 py-3 text-sm font-medium ${
                  pathname.startsWith('/teacher/assignments/')
                    ? 'bg-blue-100 text-blue-800'
                    : 'text-gray-700 hover:bg-blue-100 hover:text-blue-800'
                }`}
              >
                View Submissions
              </Link>
            </li>
            <li>
              <a
                href="https://www.laingsburgchristian.com"
                target="_blank"
                rel="noopener noreferrer"
                className="block px-4 py-3 text-sm font-medium text-gray-700 hover:bg-blue-100 hover:text-blue-800"
              >
                School Website
              </a>
            </li>
            <li>
              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-3 text-sm font-medium text-red-600 hover:bg-blue-100 hover:text-red-800"
              >
                Logout
              </button>
            </li>
          </ul>
        </nav>
      </aside>

      {/* ───────────────────────────────────────────────────────────────────
         Main Content Area
      ─────────────────────────────────────────────────────────────────── */}
      <main className="flex-1 p-6 overflow-y-auto bg-white">
        <h1 className="text-2xl font-bold text-blue-800 mb-6">Submissions</h1>

        {errorMsg && (
          <div className="mb-4 px-4 py-2 bg-blue-100 text-blue-800 rounded">
            {errorMsg}
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────────
           Ungraded Submissions
        ───────────────────────────────────────────────────────────────── */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-3 text-blue-800">Ungraded Submissions</h2>
          {ungraded.length === 0 ? (
            <p className="text-blue-600">No submissions are awaiting a grade.</p>
          ) : (
            ungraded.map((s) => {
              const fullName = nameMap[s.student_id] || s.student_id
              const [firstName, ...rest] = fullName.split(' ')
              const lastName = rest.join(' ')

              return (
                <div
                  key={s.id}
                  className="bg-white border border-blue-100 rounded-lg shadow-sm p-6 mb-6"
                >
                  <h3 className="font-semibold mb-1 text-blue-800">
                    Student: {firstName} {lastName}
                  </h3>
                  <p className="text-sm text-blue-600 mb-2">
                    Submitted At: {new Date(s.submitted_at).toLocaleString()}
                  </p>

                  <p className="mb-4 text-blue-700 whitespace-pre-wrap">
                    <span className="font-medium">Content:</span>{' '}
                    {s.content || <em>(no text submitted)</em>}
                  </p>

                  {s.file_url && (
                    <p className="mb-4">
                      <a
                        href={s.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-800 underline text-sm"
                      >
                        Download Submitted File
                      </a>
                    </p>
                  )}

                  <div className="flex flex-wrap gap-4 items-center">
                    <div className="flex items-center space-x-2">
                      <label htmlFor={`grade-${s.id}`} className="font-medium text-blue-800">
                        Grade:
                      </label>
                      <input
                        id={`grade-${s.id}`}
                        type="text"
                        placeholder="e.g. A, B+, 97"
                        className="p-2 border border-blue-200 rounded focus:outline-none focus:ring-blue-500 focus:border-blue-500 w-20"
                      />
                      <button
                        onClick={() => {
                          const newVal = document
                            .getElementById(`grade-${s.id}`)
                            .value.trim()
                          handleSaveGrade(s.id, newVal === '' ? null : newVal)
                        }}
                        className={`px-4 py-2 rounded text-white ${
                          savingGradeId === s.id
                            ? 'bg-gray-400 cursor-not-allowed'
                            : 'bg-blue-800 hover:bg-blue-900'
                        }`}
                        disabled={savingGradeId === s.id}
                      >
                        {savingGradeId === s.id ? 'Saving…' : 'Save Grade'}
                      </button>
                    </div>

                    <button
                      onClick={() => handleDeleteSubmission(s)}
                      disabled={deletingSubId === s.id}
                      className={`px-4 py-2 rounded text-white ${
                        deletingSubId === s.id
                          ? 'bg-gray-400 cursor-not-allowed'
                          : 'bg-red-600 hover:bg-red-700'
                      }`}
                    >
                      {deletingSubId === s.id ? 'Deleting…' : 'Delete Submission'}
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </section>

        {/* ─────────────────────────────────────────────────────────────────
           Already Graded Submissions
        ───────────────────────────────────────────────────────────────── */}
        <section>
          <h2 className="text-xl font-semibold mb-3 text-blue-800">Already Graded</h2>
          {graded.length === 0 ? (
            <p className="text-blue-600">No submissions have been graded yet.</p>
          ) : (
            graded.map((s) => {
              const fullName = nameMap[s.student_id] || s.student_id
              const [firstName, ...rest] = fullName.split(' ')
              const lastName = rest.join(' ')

              return (
                <div
                  key={s.id}
                  className="bg-white border border-blue-100 rounded-lg shadow-sm p-6 mb-6 flex flex-col sm:flex-row sm:justify-between sm:items-center"
                >
                  <div>
                    <h3 className="font-semibold mb-1 text-blue-800">
                      Student: {firstName} {lastName}
                    </h3>
                    <p className="text-sm text-blue-600 mb-2">
                      Submitted At: {new Date(s.submitted_at).toLocaleString()}
                    </p>
                    <p className="mb-1 text-blue-700">
                      <span className="font-medium">Content:</span>{' '}
                      {s.content || <em>(no text submitted)</em>}
                    </p>
                    {s.file_url && (
                      <p className="mb-1">
                        <a
                          href={s.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-800 underline text-sm"
                        >
                          Download Submitted File
                        </a>
                      </p>
                    )}
                    <p className="mb-1 text-blue-700">
                      <span className="font-medium">Grade:</span>{' '}
                      <span className="font-semibold">{s.grade}</span>
                    </p>
                  </div>
                  <div className="mt-4 sm:mt-0">
                    <button
                      onClick={() => handleDeleteSubmission(s)}
                      disabled={deletingSubId === s.id}
                      className={`px-4 py-2 rounded text-white ${
                        deletingSubId === s.id
                          ? 'bg-gray-400 cursor-not-allowed'
                          : 'bg-red-600 hover:bg-red-700'
                      }`}
                    >
                      {deletingSubId === s.id ? 'Deleting…' : 'Delete Submission'}
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </section>
      </main>
    </div>
  )
}
