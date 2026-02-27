'use client';

import { useState, useEffect } from 'react';
import { getInternalUserId } from '@/lib/supabase';
import {
  Calendar, Clock, MapPin, Video, Users, ExternalLink,
  ChevronLeft, ChevronRight, Loader2, CalendarOff,
} from 'lucide-react';

interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start_time: string;
  end_time?: string;
  timezone?: string;
  location?: string;
  meeting_link?: string;
  participants?: { name?: string; email?: string }[];
  status: string;
  key_topics?: string[];
  conversation_context?: string;
  google_event_id?: string;
  created_at: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

function isTomorrow(iso: string): boolean {
  const d = new Date(iso);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return d.toDateString() === tomorrow.toDateString();
}

function groupByDate(events: CalendarEvent[]): Record<string, CalendarEvent[]> {
  const groups: Record<string, CalendarEvent[]> = {};
  for (const evt of events) {
    const dateKey = new Date(evt.start_time).toDateString();
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(evt);
  }
  return groups;
}

function getDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  if (isToday(d.toISOString())) return 'Today';
  if (isTomorrow(d.toISOString())) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export default function CalendarSection() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'upcoming' | 'past'>('upcoming');
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  useEffect(() => {
    loadEvents();
  }, [view]);

  async function loadEvents() {
    setLoading(true);
    try {
      const userId = await getInternalUserId();
      if (!userId) return;

      const params = new URLSearchParams({ userId, limit: '50' });
      if (view === 'past') params.set('showPast', 'true');

      const res = await fetch(`/api/calendar?${params}`);
      const data = await res.json();

      let evts = data.events || [];
      if (view === 'past') {
        // For past view, show only past events, newest first
        evts = evts
          .filter((e: CalendarEvent) => new Date(e.start_time) < new Date())
          .reverse();
      }
      setEvents(evts);
    } catch (err) {
      console.error('Failed to load calendar events:', err);
    }
    setLoading(false);
  }

  async function cancelEvent(eventId: string) {
    try {
      await fetch('/api/calendar', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, status: 'cancelled' }),
      });
      await loadEvents();
    } catch (err) {
      console.error('Failed to cancel event:', err);
    }
  }

  const grouped = groupByDate(events);
  const sortedDates = Object.keys(grouped).sort(
    (a, b) => view === 'past'
      ? new Date(b).getTime() - new Date(a).getTime()
      : new Date(a).getTime() - new Date(b).getTime()
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
            <Calendar className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-surface-900">Calendar</h2>
            <p className="text-sm text-surface-500">Meetings detected from your conversations</p>
          </div>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex gap-1 bg-surface-100 rounded-xl p-0.5 w-fit mb-6">
        {(['upcoming', 'past'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 py-2 rounded-lg text-xs font-medium capitalize ${view === v ? 'bg-white shadow-sm text-surface-900' : 'text-surface-500'}`}
          >
            {v}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-surface-400" />
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-16 text-surface-400">
          <CalendarOff className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="font-medium">No {view} events</p>
          <p className="text-sm mt-1">Meetings detected from your WhatsApp conversations will appear here</p>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedDates.map((dateStr) => (
            <div key={dateStr}>
              <h3 className="text-sm font-semibold text-surface-600 mb-3 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-surface-400" />
                {getDateLabel(dateStr)}
              </h3>
              <div className="space-y-2">
                {grouped[dateStr].map((evt) => {
                  const isExpanded = expandedEvent === evt.id;
                  const isCancelled = evt.status === 'cancelled';
                  return (
                    <div
                      key={evt.id}
                      className={`border rounded-xl transition-all ${isCancelled
                          ? 'border-surface-100 bg-surface-50 opacity-60'
                          : isToday(evt.start_time)
                            ? 'border-indigo-200 bg-indigo-50/50'
                            : 'border-surface-200 bg-white hover:shadow-sm'
                        }`}
                    >
                      <button
                        onClick={() => setExpandedEvent(isExpanded ? null : evt.id)}
                        className="w-full text-left p-4"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-semibold ${isCancelled ? 'line-through text-surface-400' : 'text-surface-900'}`}>
                              {evt.title}
                            </p>
                            <div className="flex items-center gap-3 mt-1.5 text-xs text-surface-500">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatTime(evt.start_time)}
                                {evt.end_time && ` - ${formatTime(evt.end_time)}`}
                              </span>
                              {evt.location && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  {evt.location}
                                </span>
                              )}
                              {evt.meeting_link && (
                                <span className="flex items-center gap-1 text-indigo-600">
                                  <Video className="w-3 h-3" />
                                  Video call
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                            {evt.status === 'tentative' && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium">Tentative</span>
                            )}
                            {isCancelled && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Cancelled</span>
                            )}
                            {evt.google_event_id && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">📅 Synced</span>
                            )}
                          </div>
                        </div>
                      </button>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-0 border-t border-surface-100 mt-0">
                          <div className="pt-3 space-y-3">
                            {evt.participants && evt.participants.length > 0 && (
                              <div className="flex items-start gap-2">
                                <Users className="w-4 h-4 text-surface-400 mt-0.5 flex-shrink-0" />
                                <div className="text-sm text-surface-600">
                                  {evt.participants.map((p, i) => (
                                    <span key={i}>
                                      {p.name || p.email}
                                      {i < evt.participants!.length - 1 ? ', ' : ''}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {evt.description && (
                              <p className="text-sm text-surface-600">{evt.description}</p>
                            )}

                            {evt.key_topics && evt.key_topics.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {evt.key_topics.map((topic, i) => (
                                  <span key={i} className="text-xs px-2 py-1 rounded-full bg-indigo-100 text-indigo-700">
                                    {topic}
                                  </span>
                                ))}
                              </div>
                            )}

                            {evt.meeting_link && (
                              <a
                                href={evt.meeting_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                Join meeting
                              </a>
                            )}

                            {evt.conversation_context && (
                              <div className="bg-surface-50 rounded-lg p-3 text-xs text-surface-500">
                                <p className="font-medium text-surface-600 mb-1">Conversation context</p>
                                {evt.conversation_context.substring(0, 300)}
                                {evt.conversation_context.length > 300 ? '...' : ''}
                              </div>
                            )}

                            {!isCancelled && (
                              <div className="flex gap-2 pt-1">
                                <button
                                  onClick={() => cancelEvent(evt.id)}
                                  className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100"
                                >
                                  Cancel event
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
