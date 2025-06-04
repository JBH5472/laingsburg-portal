// File: app/student/page.js
'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../lib/supabaseClient'

export default function StudentDashboard() {
  const router = useRouter()
  const pathname = usePathname()

  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  // ─────────────────────────────────────────────────────────────────────────────
  // 1) Top‐level maps to hold text‐and‐file inputs for each assignment ID.
  //    This ensures no hooks inside loops.
  // ─────────────────────────────────────────────────────────────────────────────
  const [submissionContents, setSubmissionContents] = useState({}) // { [assignmentId]: "typed text" }
  const [submissionFiles, setSubmissionFiles] = useState({})       // { [assignmentId]: FileObject }

  // Track which submission row is being deleted
  const [deletingSubId, setDeletingSubId] = useState(null)

  // Three lists of assignments/submissions:
  const [notSubmitted, setNotSubmitted] = useState([])      // Array of assignment rows not yet submitted
  const [awaitingGrade, setAwaitingGrade] = useState([])    // Array of submission rows (grade===null)
  const [gradedAssignments, setGradedAssignments] = useState([]) // Array of submission rows (grade≠null)

  // ─────────────────────────────────────────────────────────────────────────────
  // 2) On mount: check auth, verify “student” role, then load data
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const initialize = async () => {
      // 2a) Who is logged in?
      const { data: authData } = await supabase.auth.getUser()
      const currentUser = authData?.user
      if (!currentUser) {
        // Not logged in → redirect to /login?role=student
        router.push('/login?role=student')
        return
      }
      setUser(currentUser)

      // 2b) Double-check this user’s “role” in the users table
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
      if (userInfo.role !== 'student') {
        // If a teacher/parent somehow ended up here, redirect them
        router.push(`/${userInfo.role}`)
        return
      }

      // 2c) Now load all the assignments & submissions for this student
      await loadAllData(currentUser.id)
      setLoading(false)
    }

    initialize()
  }, [router])

  // ─────────────────────────────────────────────────────────────────────────────
  // 3) Fetch assignments + submissions, split into “pending,” “awaiting grade,” “graded.”
  // ─────────────────────────────────────────────────────────────────────────────
  async function loadAllData(studentId) {
    setErrorMsg('')

    // Clear any old content/file selections so the UI resets
    setSubmissionContents({})
    setSubmissionFiles({})

    // A) Load ALL assignments (RLS ensures only assignments in this student’s class)
    let allAssignments = []
    try {
      const { data: aData, error: aError } = await supabase
        .from('assignments')
        .select('id, title, description, due_date')
        .order('due_date', { ascending: true })

      if (aError) throw aError
      allAssignments = aData || []
    } catch (err) {
      console.error('Error fetching ALL assignments:', err)
      setErrorMsg('Could not load pending assignments.')
      // Proceed anyway—but allAssignments = []
    }

    // B) Load all SUBMISSIONS this student has created (with assignment info)
    let allSubmissions = []
    try {
      const { data: sData, error: sError } = await supabase
        .from('submissions')
        .select(`
          id,
          assignment_id,
          content,
          file_url,
          grade,
          submitted_at,
          assignments (
            id,
            title,
            description,
            due_date
          )
        `)
        .eq('student_id', studentId)
        .order('submitted_at', { ascending: false })

      if (sError) throw sError
      allSubmissions = sData || []
    } catch (err) {
      console.error('Error fetching STUDENT submissions:', err)
      setErrorMsg('Could not load your submissions.')
      // Proceed anyway—but allSubmissions = []
    }

    // C) Split submissions into “awaiting grade” (grade===null) vs. “graded” (grade≠null)
    const awaiting = []
    const graded = []
    allSubmissions.forEach((row) => {
      if (row.grade === null) {
        awaiting.push(row)
      } else {
        graded.push(row)
      }
    })
    setAwaitingGrade(awaiting)
    setGradedAssignments(graded)

    // D) Build a set of assignment IDs that have already been submitted,
    //    then filter allAssignments → pending (notSubmitted)
    const submittedIds = new Set(allSubmissions.map((s) => s.assignment_id))
    const pending = allAssignments.filter((a) => !submittedIds.has(a.id))
    setNotSubmitted(pending)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4) handleSubmitAssignment:
  //    1) Upload selected file (if any) to Supabase Storage
  //    2) Get a public URL for that file
  //    3) Insert a new row into `submissions` with { content, file_url, grade:null }
  //    4) Reload data so “Not Submitted” moves under “Awaiting Grade.”
  // ─────────────────────────────────────────────────────────────────────────────
  async function handleSubmitAssignment(assignmentId) {
    setErrorMsg('')

    // 4a) Gather the typed “content” (if any)
    const contentText = submissionContents[assignmentId] || ''

    // 4b) If a file was selected, upload it first
    let fileUrl = ''
    const fileObj = submissionFiles[assignmentId]
    if (fileObj) {
      try {
        const timestamp = Date.now()
        // sanitize file name (no spaces) + URL-encode
        const sanitizedFilename = encodeURIComponent(
          fileObj.name.replace(/\s+/g, '_')
        )
        const uploadPath = `${assignmentId}/${user.id}-${timestamp}-${sanitizedFilename}`

        console.log('📤 Uploading to bucket "submissions" at path:', uploadPath)

        const { error: uploadError } = await supabase.storage
          .from('submissions')
          .upload(uploadPath, fileObj)

        if (uploadError) throw uploadError

        // Retrieve public URL
        const {
          data: { publicUrl },
        } = supabase.storage
          .from('submissions')
          .getPublicUrl(uploadPath)

        fileUrl = publicUrl
        console.log('✅ Upload succeeded! Public URL:', fileUrl)
      } catch (err) {
        console.error('❌ Supabase Storage uploadError:', err)
        setErrorMsg('Failed to upload your file. Please try again.')
        return
      }
    }

    // 4c) Insert the new submission row
    try {
      const { error: insertError } = await supabase
        .from('submissions')
        .insert({
          assignment_id: assignmentId,
          student_id: user.id,
          content: contentText,
          file_url: fileUrl, // empty string if no file chosen
          grade: null,
        })

      if (insertError) throw insertError

      // 4d) Reload data so the assignment moves under “Awaiting Grade”
      await loadAllData(user.id)
    } catch (err) {
      console.error('❌ Error inserting submission row:', err)
      setErrorMsg('Could not submit assignment. Please try again.')
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5) handleDeleteSubmission:
  //    Only allowed if ( grade===null AND now < dueDate ).
  // ─────────────────────────────────────────────────────────────────────────────
  const handleDeleteSubmission = async (submission) => {
    const dueDate = new Date(submission.assignments.due_date)
    const now = new Date()
    if (submission.grade !== null || now >= dueDate) {
      alert('Cannot delete this submission (already graded or past due).')
      return
    }
    if (!window.confirm('Delete your submission? This cannot be undone.')) {
      return
    }
    setDeletingSubId(submission.id)

    try {
      const { error } = await supabase
        .from('submissions')
        .delete()
        .eq('id', submission.id)
      if (error) throw error

      // Reload so that assignment returns to “Not Submitted”
      await loadAllData(user.id)
    } catch (err) {
      console.error('❌ Error deleting submission:', err)
      alert('Failed to delete submission. Please try again.')
    } finally {
      setDeletingSubId(null)
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
  // 8) Render the page
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
              href="/student"
              className={`text-sm font-medium ${
                pathname === '/student'
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
                  href="/student"
                  className={`block px-4 py-2 text-sm font-medium ${
                    pathname === '/student'
                      ? 'bg-white text-blue-900'
                      : 'text-blue-800 hover:bg-white hover:text-blue-900'
                  }`}
                >
                  Dashboard
                </Link>
              </li>
              {/* Removed “Profile” link because /student/profile doesn’t exist yet */}
              <li>
                <a
                  href="https://www.laingsburgchristian.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-4 py-2 text-sm font-medium text-blue-800 hover:bg-white hover:text-blue-900"
                >
                  School Site
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
          <h1 className="text-2xl font-bold mb-6 text-blue-900">Student Dashboard</h1>

          {errorMsg && (
            <div className="mb-4 px-4 py-2 bg-red-100 text-red-700 rounded">
              {errorMsg}
            </div>
          )}

          {/* ───────────────────────────────────────────────────────────────────
             8a) Graded Assignments
          ─────────────────────────────────────────────────────────────────── */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold mb-3 text-blue-900">
              Graded Assignments
            </h2>
            {gradedAssignments.length === 0 ? (
              <p className="text-blue-800">No graded assignments yet.</p>
            ) : (
              gradedAssignments.map((row) => (
                <div
                  key={row.id}
                  className="bg-white border border-blue-200 p-4 rounded-lg shadow-sm mb-4"
                >
                  <h3 className="font-semibold text-blue-900">
                    {row.assignments.title}
                  </h3>
                  <p className="text-sm text-blue-600 mb-1">
                    Due:{' '}
                    {new Date(row.assignments.due_date).toLocaleDateString()}
                  </p>
                  <p className="text-sm mb-1">
                    <span className="font-medium">Your Grade:</span>{' '}
                    <span className="font-semibold text-blue-800">{row.grade}</span>
                  </p>
                  <p className="text-sm italic text-blue-600 mb-2">
                    Submitted At:{' '}
                    {new Date(row.submitted_at).toLocaleString()}
                  </p>
                  <p className="mt-2 text-blue-700">
                    {row.assignments.description}
                  </p>
                  {row.file_url && (
                    <p className="mt-2">
                      <a
                        href={row.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-900 underline text-sm"
                      >
                        Download Submitted File
                      </a>
                    </p>
                  )}
                </div>
              ))
            )}
          </section>

          {/* ───────────────────────────────────────────────────────────────────
             8b) Assignments You Have Not Yet Submitted
          ─────────────────────────────────────────────────────────────────── */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold mb-3 text-blue-900">
              Assignments You Have Not Yet Submitted
            </h2>
            {notSubmitted.length === 0 ? (
              <p className="text-blue-800">
                All assignments have been submitted or are awaiting a grade.
              </p>
            ) : (
              notSubmitted.map((a) => {
                // Compute uploadError if a prior upload failed
                const uploadError =
                  errorMsg && errorMsg.startsWith('Failed to upload') ? errorMsg : ''

                return (
                  <div
                    key={a.id}
                    className="bg-white border border-blue-200 p-6 rounded-lg shadow-sm mb-6"
                  >
                    <h3 className="font-semibold text-blue-900">{a.title}</h3>
                    <p className="text-sm text-blue-600 mb-1">
                      Due: {new Date(a.due_date).toLocaleDateString()}
                    </p>
                    <p className="text-blue-700 mb-4">{a.description}</p>

                    {/* Textarea for typed content */}
                    <textarea
                      rows={4}
                      placeholder="Type your answer or content here..."
                      value={submissionContents[a.id] || ''}
                      onChange={(e) =>
                        setSubmissionContents({
                          ...submissionContents,
                          [a.id]: e.target.value,
                        })
                      }
                      className="w-full p-3 border border-blue-300 rounded-lg mb-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />

                    {/* Hidden file input + styled label */}
                    <div className="flex items-center space-x-3 mb-3">
                      <input
                        id={`file-${a.id}`}
                        type="file"
                        accept=".pdf,.doc,.docx,.txt"
                        onChange={(e) =>
                          setSubmissionFiles({
                            ...submissionFiles,
                            [a.id]: e.target.files[0],
                          })
                        }
                        className="hidden"
                      />
                      <label
                        htmlFor={`file-${a.id}`}
                        className="inline-block bg-blue-800 hover:bg-blue-900 text-white px-4 py-2 rounded-lg text-sm font-medium cursor-pointer"
                      >
                        Upload File
                      </label>
                      {submissionFiles[a.id] && (
                        <span className="text-blue-800 text-sm truncate max-w-md">
                          {submissionFiles[a.id].name}
                        </span>
                      )}
                    </div>

                    {uploadError && (
                      <p className="text-red-600 text-sm mb-3">{uploadError}</p>
                    )}

                    <button
                      onClick={() => handleSubmitAssignment(a.id)}
                      className="bg-blue-800 hover:bg-blue-900 text-white px-6 py-2 rounded-lg shadow"
                    >
                      Submit
                    </button>
                  </div>
                )
              })
            )}
          </section>

          {/* ───────────────────────────────────────────────────────────────────
             8c) Submitted (Awaiting Grade)
          ─────────────────────────────────────────────────────────────────── */}
          <section>
            <h2 className="text-xl font-semibold mb-3 text-blue-900">
              Submitted (Awaiting Grade)
            </h2>
            {awaitingGrade.length === 0 ? (
              <p className="text-blue-800">No submissions are currently awaiting a grade.</p>
            ) : (
              awaitingGrade.map((row) => {
                const dueDate = new Date(row.assignments.due_date)
                const now = new Date()
                // Only allow deletion if now < dueDate AND grade is still null
                const canDelete = row.grade === null && now < dueDate

                return (
                  <div
                    key={row.id}
                    className="bg-white border border-blue-200 p-6 rounded-lg shadow-sm mb-6"
                  >
                    <h3 className="font-semibold text-blue-900">
                      {row.assignments.title}
                    </h3>
                    <p className="text-sm text-blue-600 mb-1">
                      Due: {new Date(row.assignments.due_date).toLocaleDateString()}
                    </p>
                    <p className="mt-2 mb-2 text-blue-700">
                      {row.assignments.description}
                    </p>
                    <p className="text-sm text-blue-600 mb-2 italic">
                      Submitted At: {new Date(row.submitted_at).toLocaleString()}
                    </p>

                    <p className="mb-2 text-blue-700">
                      <span className="font-medium">Your Content:</span>{' '}
                      {row.content || <em>(no content submitted)</em>}
                    </p>

                    {row.file_url && (
                      <p className="mb-2">
                        <a
                          href={row.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-900 underline text-sm"
                        >
                          Download Submitted File
                        </a>
                      </p>
                    )}

                    <p className="text-sm font-medium text-blue-600 mb-3">
                      Awaiting grade…
                    </p>

                    {canDelete ? (
                      <button
                        onClick={() => handleDeleteSubmission(row)}
                        disabled={deletingSubId === row.id}
                        className={`px-4 py-2 rounded-lg text-white ${
                          deletingSubId === row.id
                            ? 'bg-gray-400 cursor-not-allowed'
                            : 'bg-red-600 hover:bg-red-700'
                        }`}
                      >
                        {deletingSubId === row.id ? 'Deleting…' : 'Delete Submission'}
                      </button>
                    ) : (
                      <p className="text-sm text-blue-500 italic mt-1">
                        {row.grade !== null
                          ? 'Cannot delete (already graded)'
                          : now >= dueDate
                          ? 'Cannot delete (past due date)'
                          : ''}
                      </p>
                    )}
                  </div>
                )
              })
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
