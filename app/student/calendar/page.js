'use client'

import { useState, useEffect, useMemo } from 'react'
import Modal from 'react-modal'
import { supabase } from '../../../lib/supabaseClient'
import CalendarLayout from '../../../components/CalendarLayout'

export default function StudentCalendarPage() {
  // ─────────────────────────────────────────────────────────────────────────────
  // (A) Bind React-Modal to <body> once mounted
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    Modal.setAppElement('body')
  }, [])

  // ─────────────────────────────────────────────────────────────────────────────
  // (B) State: this student’s classes, the events, loading/error
  // ─────────────────────────────────────────────────────────────────────────────
  const [classIds, setClassIds] = useState([])     // array of UUIDs
  const [events, setEvents] = useState([])         // events visible to this student
  const [loadingData, setLoadingData] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  // Month/Year view state (so students can also navigate months)
  const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear())
  const [currentMonth, setCurrentMonth] = useState(() => new Date().getMonth())

  // ─────────────────────────────────────────────────────────────────────────────
  // (C) On mount: fetch this student’s enrolled classes AND events
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function fetchStudentData() {
      setLoadingData(true)
      setErrorMsg('')

      // 1) Get current user
      const {
        data: { user },
        error: authErr,
      } = await supabase.auth.getUser()
      if (authErr || !user) {
        setErrorMsg('Not logged in.')
        setLoadingData(false)
        return
      }

      // 2) Fetch all class_ids from student_class join table
      const { data: scData, error: scErr } = await supabase
        .from('student_class')
        .select('class_id')
        .eq('student_id', user.id)

      if (scErr) {
        console.error('Error fetching student_class:', scErr)
        setErrorMsg('Could not load your enrolled classes.')
        setLoadingData(false)
        return
      }
      const clsIds = scData.map((r) => r.class_id)
      setClassIds(clsIds)

      // 3) Fetch events that are either schoolwide OR have class_id ∈ this student’s classes
      const { data: evData, error: evErr } = await supabase
        .from('events')
        .select('id, title, start_time, end_time, class_id, schoolwide')
        // We cannot directly “.or('schoolwide.eq.true,class_id.in.(${clsIds})')”
        // because clsIds may be empty. Instead:
        .or(
          `schoolwide.eq.true,class_id.in.(${clsIds.length > 0 ? `'${clsIds.join(
            "','"
          )}'` : `''`})`
        )
        .order('start_time', { ascending: true })

      if (evErr) {
        console.error('Error fetching events:', evErr)
        setErrorMsg('Could not load calendar events.')
        setLoadingData(false)
        return
      }
      setEvents(evData || [])
      setLoadingData(false)
    }

    fetchStudentData()
  }, [])

  // ─────────────────────────────────────────────────────────────────────────────
  // (D) Month navigation
  // ─────────────────────────────────────────────────────────────────────────────
  function goToPrevMonth() {
    if (currentMonth === 0) {
      setCurrentYear(currentYear - 1)
      setCurrentMonth(11)
    } else {
      setCurrentMonth(currentMonth - 1)
    }
  }
  function goToNextMonth() {
    if (currentMonth === 11) {
      setCurrentYear(currentYear + 1)
      setCurrentMonth(0)
    } else {
      setCurrentMonth(currentMonth + 1)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // (E) Build the same “calendarGrid” structure
  // ─────────────────────────────────────────────────────────────────────────────
  const calendarGrid = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1).getDay()
    const numDays = new Date(currentYear, currentMonth + 1, 0).getDate()

    const flatDays = []
    for (let i = 0; i < firstDay; i++) {
      flatDays.push(null)
    }
    for (let day = 1; day <= numDays; day++) {
      const dt = new Date(currentYear, currentMonth, day)
      const evOnThisDay = events.filter((ev) => {
        const evStart = new Date(ev.start_time)
        return (
          evStart.getFullYear() === dt.getFullYear() &&
          evStart.getMonth() === dt.getMonth() &&
          evStart.getDate() === dt.getDate()
        )
      })
      flatDays.push({ date: dt, eventsOnThatDay: evOnThisDay })
    }

    const weeks = []
    for (let i = 0; i < flatDays.length; i += 7) {
      weeks.push(flatDays.slice(i, i + 7))
    }
    const lastWeek = weeks[weeks.length - 1]
    if (lastWeek.length < 7) {
      const missing = 7 - lastWeek.length
      for (let i = 0; i < missing; i++) {
        lastWeek.push(null)
      }
    }
    return weeks
  }, [currentYear, currentMonth, events])

  // ─────────────────────────────────────────────────────────────────────────────
  // (F) Check if a date string “YYYY-MM-DD” is in the visible month
  // ─────────────────────────────────────────────────────────────────────────────
  function isInCurrentMonth(dateString) {
    const [y, m] = dateString.split('-').map(Number)
    return y === currentYear && m - 1 === currentMonth
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // (G) Render
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <CalendarLayout>
      <div className="px-8 py-6 w-full">
        <h1 className="text-3xl font-bold text-blue-900 mb-4">Student Calendar</h1>

        {errorMsg && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">{errorMsg}</div>
        )}
        {loadingData ? (
          <div className="text-gray-600">Loading calendar…</div>
        ) : (
          <>
            {/* Month header */}
            <div className="flex items-center justify-center mb-4 space-x-6">
              <button
                onClick={goToPrevMonth}
                className="text-blue-600 hover:text-blue-800 font-bold"
              >
                &#8249;
              </button>
              <div className="text-xl font-semibold text-blue-800">
                {new Date(currentYear, currentMonth).toLocaleString('default', {
                  month: 'long',
                  year: 'numeric',
                })}
              </div>
              <button
                onClick={goToNextMonth}
                className="text-blue-600 hover:text-blue-800 font-bold"
              >
                &#8250;
              </button>
            </div>

            {/* Weekday labels */}
            <div className="grid grid-cols-7 text-center text-sm font-medium text-gray-600 mb-1">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((wd) => (
                <div key={wd}>{wd}</div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {calendarGrid.map((week, wi) =>
                week.map((dayObj, di) => {
                  if (!dayObj) {
                    return <div key={`${wi}-${di}`} className="h-20"></div>
                  }
                  const dayNum = dayObj.date.getDate()
                  const isoDate = dayObj.date.toISOString().slice(0, 10)
                  const inMonth = isInCurrentMonth(isoDate)
                  return (
                    <div
                      key={`${wi}-${di}`}
                      className={`h-28 p-1 border rounded-lg flex flex-col justify-between ${
                        inMonth
                          ? 'bg-white'
                          : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {/* Number + dot */}
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{inMonth ? dayNum : ''}</span>
                        {dayObj.eventsOnThatDay.length > 0 && (
                          <span className="h-2 w-2 rounded-full bg-blue-600"></span>
                        )}
                      </div>
                      {/* Up to two event titles */}
                      <div className="text-xs h-full overflow-hidden">
                        {dayObj.eventsOnThatDay.slice(0, 2).map((ev) => (
                          <div key={ev.id} className="truncate text-blue-700">
                            • {ev.title}
                          </div>
                        ))}
                        {dayObj.eventsOnThatDay.length > 2 && (
                          <div className="text-xs text-gray-500">…</div>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </>
        )}
      </div>
    </CalendarLayout>
  )
}
