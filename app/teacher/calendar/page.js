// File: app/teacher/calendar/page.js
'use client'

import { useState, useEffect, useMemo } from 'react'
import Modal from 'react-modal'
import { supabase } from '../../../lib/supabaseClient'
import CalendarLayout from '../../../components/CalendarLayout'

export default function TeacherCalendarPage() {
  // ─────────────────────────────────────────────────────────────────────────────
  // (A) Bind React-Modal to <body> on mount (Next13 has no #__next in App Router).
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    Modal.setAppElement('body')
  }, [])

  // ─────────────────────────────────────────────────────────────────────────────
  // (B) Local state:
  //   • classesList → all classes that this teacher “owns”
  //   • events     → all events (schoolwide + class-specific)
  //   • loadingData / errorMsg
  //   • calendarNav: currentYear, currentMonth
  //   • Modal & form fields: modalIsOpen, selectedDate, dayEvents,
  //                          title, classId, startTime, endTime
  // ─────────────────────────────────────────────────────────────────────────────
  const [classesList, setClassesList]   = useState([])   // { id, name }[]
  const [events, setEvents]             = useState([])   // all events from Supabase
  const [loadingData, setLoadingData]   = useState(true)
  const [errorMsg, setErrorMsg]         = useState('')

  // Calendar navigation:
  const [currentYear, setCurrentYear]   = useState(() => new Date().getFullYear())
  const [currentMonth, setCurrentMonth] = useState(() => new Date().getMonth())

  // Modal state & form fields:
  const [modalIsOpen, setModalIsOpen]   = useState(false)
  const [selectedDate, setSelectedDate] = useState('')   // 'YYYY-MM-DD'
  const [dayEvents, setDayEvents]       = useState([])   // events on that date

  const [title, setTitle]       = useState('')
  const [classId, setClassId]   = useState('')
  const [startTime, setStartTime] = useState('')         // 'HH:MM'
  const [endTime, setEndTime]     = useState('')         // 'HH:MM'

  // ─────────────────────────────────────────────────────────────────────────────
  // (C) On mount: fetch teacher’s classes + all events in one request.
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function fetchInitialData() {
      setLoadingData(true)
      setErrorMsg('')

      // (C.1) Identify current teacher user
      const {
        data: { user },
        error: authErr,
      } = await supabase.auth.getUser()
      if (authErr || !user) {
        setErrorMsg('Unable to identify you. Please log in again.')
        setLoadingData(false)
        return
      }

      // (C.2) Fetch all classes that this teacher “owns”
      const { data: clsData, error: clsErr } = await supabase
        .from('classes')
        .select('id, name')
        .eq('teacher_id', user.id)

      if (clsErr) {
        console.error('Error fetching classes:', clsErr)
        setErrorMsg('Could not load your classes.')
        setLoadingData(false)
        return
      }
      setClassesList(clsData || [])

      // (C.3) Fetch ALL events (schoolwide + class-specific) so teacher sees them
      const { data: evData, error: evErr } = await supabase
        .from('events')
        .select(`
          id,
          title,
          date,
          start_time,
          end_time,
          class_id,
          schoolwide
        `)
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

    fetchInitialData()
  }, [])

  // ─────────────────────────────────────────────────────────────────────────────
  // (D) Helpers to navigate months
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
  // (E) Build “grid” of days for (currentYear, currentMonth). Each cell is
  //     either null (blank) or { date: Date, eventsOnThatDay: [...] }.
  // ─────────────────────────────────────────────────────────────────────────────
  const calendarGrid = useMemo(() => {
    // 1) Index of first weekday of this month (0=Sunday..6=Saturday)
    const firstDayIndex   = new Date(currentYear, currentMonth, 1).getDay()
    // 2) Number of days in this month
    const numDaysInMonth  = new Date(currentYear, currentMonth + 1, 0).getDate()

    // 3) Build a flat array: [null × firstDayIndex, then each day=1..numDaysInMonth]
    const flat = []
    for (let i = 0; i < firstDayIndex; i++) {
      flat.push(null)
    }
    for (let day = 1; day <= numDaysInMonth; day++) {
      const dt = new Date(currentYear, currentMonth, day)
      // Filter events whose start_time falls on this exact calendar date
      const evOnThisDay = events.filter((ev) => {
        const evStart = new Date(ev.start_time)
        return (
          evStart.getFullYear() === dt.getFullYear() &&
          evStart.getMonth() === dt.getMonth() &&
          evStart.getDate() === dt.getDate()
        )
      })
      flat.push({ date: dt, eventsOnThatDay: evOnThisDay })
    }

    // 4) Chunk flat into weeks of length 7; pad last week with nulls if needed
    const weeks = []
    for (let i = 0; i < flat.length; i += 7) {
      weeks.push(flat.slice(i, i + 7))
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
  // (F) When user clicks on a day cell OR “+ Add New Event” button:
  //     • If dayObj passed: prefill selectedDate & collect dayEvents
  //     • If no dayObj: open modal with today’s date & no existing events
  // ─────────────────────────────────────────────────────────────────────────────
  function openModalWith(dateObj = null) {
    let isoString = ''
    if (dateObj) {
      const y = dateObj.getFullYear()
      const m = String(dateObj.getMonth() + 1).padStart(2, '0')
      const d = String(dateObj.getDate()).padStart(2, '0')
      isoString = `${y}-${m}-${d}`

      // Filter events on that chosen date
      const eventsOnDate = events.filter((ev) => {
        const evD = new Date(ev.start_time)
        return (
          evD.getFullYear() === dateObj.getFullYear() &&
          evD.getMonth() === dateObj.getMonth() &&
          evD.getDate() === dateObj.getDate()
        )
      })
      setDayEvents(eventsOnDate)
    } else {
      // If no dateObj: default to today's date and no dayEvents yet
      const today = new Date()
      const y = today.getFullYear()
      const m = String(today.getMonth() + 1).padStart(2, '0')
      const d = String(today.getDate()).padStart(2, '0')
      isoString = `${y}-${m}-${d}`
      setDayEvents([])
    }
    setSelectedDate(isoString)
    setTitle('')
    setClassId('')
    setStartTime('')
    setEndTime('')
    setErrorMsg('')
    setModalIsOpen(true)
  }

  function closeModal() {
    setModalIsOpen(false)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // (G) When “Save Event” is clicked inside the modal:
  //     1) Validate fields
  //     2) Build start/end ISO strings
  //     3) Build payload (including mandatory `date`)
  //     4) Insert into Supabase; re-fetch all events
  // ─────────────────────────────────────────────────────────────────────────────
  async function handleSaveEvent(e) {
    e.preventDefault()
    setErrorMsg('')

    // 1) Basic validation
    if (!title.trim() || !selectedDate || !startTime || !endTime) {
      setErrorMsg('Please fill in all fields.')
      return
    }
    if (!classId) {
      setErrorMsg('Please choose one of your classes.')
      return
    }

    // 2) Build ISO datetimes
    //    “2025-06-15” + “08:30” → “2025-06-15T08:30:00.000Z”
    const startISO = new Date(`${selectedDate}T${startTime}`).toISOString()
    const endISO   = new Date(`${selectedDate}T${endTime}`).toISOString()

    // 3) Identify current user
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser()
    if (authErr || !user) {
      setErrorMsg('Session expired. Please log in again.')
      return
    }

    // 4) Build payload (including date!)
    const payload = {
      title:      title.trim(),
      date:       selectedDate,          // ← must include date column
      start_time: startISO,
      end_time:   endISO,
      created_by: user.id,
      schoolwide: false,                // teachers only create class-specific events
      class_id:   classId,
    }

    // 5) Attempt insert
    const { error: insertErr } = await supabase.from('events').insert(payload)
    if (insertErr) {
      console.error('Error inserting event:', insertErr)
      setErrorMsg('Could not save event (check your permissions).')
      return
    }

    // 6) Re-fetch all events (so calendar view immediately updates)
    const { data: evData, error: evErr } = await supabase
      .from('events')
      .select(`id, title, date, start_time, end_time, class_id, schoolwide`)
      .order('start_time', { ascending: true })
    if (!evErr) {
      setEvents(evData || [])
    }

    closeModal()
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // (H) Delete an event (only if teacher “owns” it, i.e. event.class_id ∈ classesList)
  // ─────────────────────────────────────────────────────────────────────────────
  async function handleDeleteEvent(evId) {
    if (!window.confirm('Are you sure you want to delete this event?')) return

    // Attempt delete
    const { error: delErr } = await supabase.from('events').delete().eq('id', evId)
    if (delErr) {
      console.error('Error deleting event:', delErr)
      alert('Could not delete event. Check your permissions.')
      return
    }

    // After deletion, re-fetch events & re-filter dayEvents for the same selectedDate
    const { data: evData, error: evErr } = await supabase
      .from('events')
      .select(`id, title, date, start_time, end_time, class_id, schoolwide`)
      .order('start_time', { ascending: true })
    if (!evErr) {
      setEvents(evData || [])
      // Refilter dayEvents by selectedDate
      const filtered = evData.filter((ev) => {
        // Compare ev.date (which is a string "YYYY-MM-DD") to selectedDate
        return ev.date === selectedDate
      })
      setDayEvents(filtered)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // (I) Utility: check if a “YYYY-MM-DD” string is in the current month
  // ─────────────────────────────────────────────────────────────────────────────
  function isInCurrentMonth(dateString) {
    const [y, m] = dateString.split('-').map(Number)
    return y === currentYear && m - 1 === currentMonth
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // (J) Given a classId, return that class’s name (or “Unknown Class”)
  // ─────────────────────────────────────────────────────────────────────────────
  function getClassNameById(cid) {
    const cls = classesList.find((c) => c.id === cid)
    return cls ? cls.name : 'Unknown Class'
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // (K) Render
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <CalendarLayout>
      <div className="px-8 py-6 w-full">
        {/* ─────────── Header: Title + “Add New Event” ─────────── */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-bold text-blue-900">Teacher Calendar</h1>
          <button
            onClick={() => openModalWith(null)}
            className="flex items-center bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded"
          >
            + Add New Event
          </button>
        </div>

        {/* ─────────── Show error or loading ─────────── */}
        {errorMsg && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">{errorMsg}</div>
        )}
        {loadingData ? (
          <div className="text-gray-600">Loading calendar…</div>
        ) : (
          <>
            {/* ─────────── Month navigation ─────────── */}
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

            {/* ─────────── Weekday headers ─────────── */}
            <div className="grid grid-cols-7 text-center text-sm font-medium text-gray-600 mb-1">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((wd) => (
                <div key={wd}>{wd}</div>
              ))}
            </div>

            {/* ─────────── Calendar grid ─────────── */}
            <div className="grid grid-cols-7 gap-1">
              {calendarGrid.map((week, wi) =>
                week.map((dayObj, di) => {
                  if (!dayObj) {
                    // Blank cell
                    return <div key={`${wi}-${di}`} className="h-20"></div>
                  }
                  const dayNum = dayObj.date.getDate()
                  const isoDate = dayObj.date.toISOString().slice(0, 10) // 'YYYY-MM-DD'
                  const inMonth = isInCurrentMonth(isoDate)

                  return (
                    <div
                      key={`${wi}-${di}`}
                      className={`h-28 p-1 border rounded-lg flex flex-col justify-between cursor-pointer ${
                        inMonth
                          ? 'bg-white hover:bg-blue-50'
                          : 'bg-gray-100 text-gray-400'
                      }`}
                      onClick={() => inMonth && openModalWith(dayObj.date)}
                    >
                      {/* Day number + “dot” if any events exist */}
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{inMonth ? dayNum : ''}</span>
                        {dayObj.eventsOnThatDay.length > 0 && (
                          <span className="h-2 w-2 rounded-full bg-blue-600"></span>
                        )}
                      </div>

                      {/* ─────────── Show up to 2 event lines (with start→end times) ─────────── */}
                      <div className="text-xs h-full overflow-hidden">
                        {dayObj.eventsOnThatDay.slice(0, 2).map((ev) => {
                          // Format start & end times as “H:MM AM/PM”
                          const s = new Date(ev.start_time)
                          const e = new Date(ev.end_time)

                          const sHrRaw = s.getHours()
                          const sHr12  = sHrRaw % 12 === 0 ? 12 : sHrRaw % 12
                          const sMin   = String(s.getMinutes()).padStart(2, '0')
                          const sAMPM  = sHrRaw >= 12 ? 'PM' : 'AM'
                          const sLabel = `${sHr12}:${sMin} ${sAMPM}`

                          const eHrRaw = e.getHours()
                          const eHr12  = eHrRaw % 12 === 0 ? 12 : eHrRaw % 12
                          const eMin   = String(e.getMinutes()).padStart(2, '0')
                          const eAMPM  = eHrRaw >= 12 ? 'PM' : 'AM'
                          const eLabel = `${eHr12}:${eMin} ${eAMPM}`

                          return (
                            <div key={ev.id} className="truncate text-blue-700">
                              • <span className="font-semibold">{sLabel}–{eLabel}</span>{' '}
                              – {ev.title}
                            </div>
                          )
                        })}
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

      {/* ─────────────────────────────────────────────────────────────────────────────
         (L) “Day Details & Add New Event” Modal
      ───────────────────────────────────────────────────────────────────────────── */}
      <Modal
        isOpen={modalIsOpen}
        onRequestClose={closeModal}
        contentLabel="Day Details & Add New Event"
        overlayClassName="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
        className="bg-white rounded-lg w-96 max-w-full p-6 mx-4"
      >
        {/* ─────────── Header: “Events on {selectedDate}” or “No events on…” ─────────── */}
        <h2 className="text-xl font-semibold mb-4">
          {dayEvents.length > 0
            ? `Events on ${selectedDate}`
            : `No events on ${selectedDate}`}
        </h2>

        {/* ─────────── List all existing events for that date ─────────── */}
        {dayEvents.length > 0 && (
          <div className="mb-4 max-h-52 overflow-auto">
            {dayEvents.map((ev) => {
              // Format both start & end as “H:MM AM/PM”
              const s = new Date(ev.start_time)
              const e = new Date(ev.end_time)

              const sHrRaw = s.getHours()
              const sHr12  = sHrRaw % 12 === 0 ? 12 : sHrRaw % 12
              const sMin   = String(s.getMinutes()).padStart(2, '0')
              const sAMPM  = sHrRaw >= 12 ? 'PM' : 'AM'
              const sLabel = `${sHr12}:${sMin} ${sAMPM}`

              const eHrRaw = e.getHours()
              const eHr12  = eHrRaw % 12 === 0 ? 12 : eHrRaw % 12
              const eMin   = String(e.getMinutes()).padStart(2, '0')
              const eAMPM  = eHrRaw >= 12 ? 'PM' : 'AM'
              const eLabel = `${eHr12}:${eMin} ${eAMPM}`

              // Determine “assignedTo” text (no “school-wide” on teacher side,
              // but just in case RLS/rows slip through, we show the text)
              const assignedTo = ev.schoolwide
                ? 'School-wide'
                : getClassNameById(ev.class_id)

              // Check if this teacher “owns” that class (so they can delete)
              const isOwner =
                !ev.schoolwide &&
                classesList.some((c) => c.id === ev.class_id)

              return (
                <div
                  key={ev.id}
                  className="mb-3 p-3 border rounded-lg flex flex-col space-y-1"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-sm text-gray-800 font-semibold">
                        {ev.title}
                      </div>
                      <div className="text-xs text-gray-600">
                        {sLabel} – {eLabel}
                      </div>
                    </div>
                    {isOwner && (
                      <button
                        onClick={() => handleDeleteEvent(ev.id)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 italic">
                    {assignedTo}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ─────────── Separator ─────────── */}
        <hr className="my-4 border-gray-300" />

        {/* ─────────── “Add New Event” form ─────────── */}
        <form onSubmit={handleSaveEvent} className="space-y-4">
          {/* Event Title */}
          <div>
            <label htmlFor="ev-title" className="block text-sm font-medium text-gray-700">
              Event Title
            </label>
            <input
              id="ev-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="e.g. Field Trip"
              required
            />
          </div>

          {/* Assign To (only teacher’s own classes) */}
          <div>
            <label htmlFor="ev-class" className="block text-sm font-medium text-gray-700">
              Assign To
            </label>
            <select
              id="ev-class"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className="mt-1 w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
              required
            >
              <option value="">— Select Your Class —</option>
              {classesList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date (prefilled to selectedDate) */}
          <div>
            <label htmlFor="ev-date" className="block text-sm font-medium text-gray-700">
              Date
            </label>
            <input
              id="ev-date"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="mt-1 w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
              min="1900-01-01"
              max="2100-12-31"
              required
            />
          </div>

          {/* Start Time */}
          <div>
            <label htmlFor="ev-start" className="block text-sm font-medium text-gray-700">
              Start Time
            </label>
            <input
              id="ev-start"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="mt-1 w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
              required
            />
          </div>

          {/* End Time */}
          <div>
            <label htmlFor="ev-end" className="block text-sm font-medium text-gray-700">
              End Time
            </label>
            <input
              id="ev-end"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="mt-1 w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
              required
            />
          </div>

          {/* Form-level error */}
          {errorMsg && (
            <div className="text-red-700 text-sm px-2 py-1 bg-red-100 rounded">
              {errorMsg}
            </div>
          )}

          {/* Buttons */}
          <div className="flex justify-end space-x-3 mt-4">
            <button
              type="button"
              onClick={closeModal}
              className="px-4 py-2 rounded border border-gray-300 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white"
            >
              Save Event
            </button>
          </div>
        </form>
      </Modal>
    </CalendarLayout>
  )
}
