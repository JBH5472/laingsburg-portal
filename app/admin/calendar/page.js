// File: /app/admin/calendar/page.js
'use client';

import { useEffect, useState } from 'react';
import CalendarLayout from '../../../components/CalendarLayout';
import { supabase } from '../../../lib/supabaseClient';
import Modal from 'react-modal';

Modal.setAppElement('#__next');

export default function AdminCalendarPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [user, setUser] = useState(null);

  // Modal state
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const initialize = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentCurrentuser) {
        window.location.href = '/login?role=admin';
        return;
      }
      setUser(currentCurrentuser);

      // Fetch ALL events (admins see everything)
      await fetchEvents();
    };

    initialize();
  }, []);

  async function fetchEvents() {
    setLoading(true);
    setErrorMsg('');

    const { data: evData, error: evError } = await supabase
      .from('events')
      .select('id, title, description, start_time, end_time, all_day, schoolwide, class_id')
      .order('start_time', { ascending: true });

    if (evError) {
      console.error(evError);
      setErrorMsg('Could not load events.');
    } else {
      setEvents(evData || []);
    }

    setLoading(false);
  }

  // Modal controls
  const openModal = () => setIsOpen(true);
  const closeModal = () => {
    setTitle('');
    setDescription('');
    setStartTime('');
    setEndTime('');
    setAllDay(false);
    setIsOpen(false);
    setErrorMsg('');
  };

  // Add a new school-wide event
  const handleAddEvent = async (e) => {
    e.preventDefault();
    if (!title || !startTime || !endTime) {
      setErrorMsg('Please fill in all required fields.');
      return;
    }
    setSubmitting(true);
    setErrorMsg('');

    const newEvent = {
      title: title.trim(),
      description: description.trim(),
      start_time: new Date(startTime).toISOString(),
      end_time: new Date(endTime).toISOString(),
      all_day: allDay,
      schoolwide: true,     // Admin → always school‐wide
      class_id: null,       // Must be NULL
      created_by: user.id,
    };

    const { error: insertError } = await supabase
      .from('events')
      .insert(newEvent);

    if (insertError) {
      console.error(insertError);
      setErrorMsg('Failed to create school‐wide event.');
      setSubmitting(false);
      return;
    }

    await fetchEvents();
    setSubmitting(false);
    closeModal();
  };

  return (
    <CalendarLayout role="teacher">
      {/* We re‐use Teacher’s layout; you could pass role="admin" if you want slight variations */}
      <div className="max-w-4xl mx-auto">
        {errorMsg && (
          <div className="mb-4 px-4 py-2 bg-red-100 text-red-700 rounded">
            {errorMsg}
          </div>
        )}

        <button
          onClick={openModal}
          className="mb-6 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
        >
          + Add School-Wide Event
        </button>

        {loading ? (
          <p className="text-gray-600">Loading events…</p>
        ) : events.length === 0 ? (
          <p className="text-gray-600">No events to display.</p>
        ) : (
          <ul className="space-y-4">
            {events.map((ev) => {
              const start = new Date(ev.start_time).toLocaleString();
              const end = new Date(ev.end_time).toLocaleString();
              return (
                <li key={ev.id} className="bg-white p-4 rounded-lg shadow">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold">{ev.title}</h3>
                    {ev.schoolwide ? (
                      <span className="text-sm font-medium text-red-600">School-wide</span>
                    ) : (
                      <span className="text-sm font-medium text-blue-600">Class Event</span>
                    )}
                  </div>
                  {ev.description && (
                    <p className="text-sm text-gray-600 mb-1">{ev.description}</p>
                  )}
                  <p className="text-sm text-gray-700">
                    {ev.all_day
                      ? `All Day: ${new Date(ev.start_time).toLocaleDateString()}`
                      : `${start} — ${end}`}
                  </p>
                  {!ev.schoolwide && (
                    <p className="text-sm text-gray-500 mt-1">Class ID: {ev.class_id}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Admin → Add Event Modal */}
      <Modal
        isOpen={isOpen}
        onRequestClose={closeModal}
        contentLabel="Create School-Wide Event"
        className="max-w-lg mx-auto mt-24 bg-white p-6 rounded-lg shadow-lg outline-none"
        overlayClassName="fixed inset-0 bg-black bg-opacity-30"
      >
        <h2 className="text-xl font-semibold mb-4">Create School-Wide Event</h2>
        <form onSubmit={handleAddEvent} className="space-y-4">
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700">
              Title *
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">
              Description
            </label>
            <textarea
              id="description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="inline-flex items-center">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                className="form-checkbox h-5 w-5 text-blue-600"
              />
              <span className="ml-2 text-sm text-gray-700">All Day Event</span>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="startTime" className="block text-sm font-medium text-gray-700">
                Start {allDay ? 'Date' : 'Date & Time'} *
              </label>
              <input
                id="startTime"
                type={allDay ? 'date' : 'datetime-local'}
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label htmlFor="endTime" className="block text-sm font-medium text-gray-700">
                End {allDay ? 'Date' : 'Date & Time'} *
              </label>
              <input
                id="endTime"
                type={allDay ? 'date' : 'datetime-local'}
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
          </div>

          <div className="flex justify-end space-x-2">
            <button
              type="button"
              onClick={closeModal}
              className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Save Event'}
            </button>
          </div>
        </form>
      </Modal>
    </CalendarLayout>
  );
}
