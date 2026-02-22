/**
 * Calendar Events API — Dashboard CRUD
 * GET  /api/calendar?userId=xxx — list upcoming events
 * POST /api/calendar — create/confirm event
 * PUT  /api/calendar — update event status
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET: List calendar events
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('userId');
  const status = request.nextUrl.searchParams.get('status'); // confirmed, tentative, all
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '20');

  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  let query = supabaseAdmin
    .from('calendar_events')
    .select('*')
    .eq('user_id', userId)
    .order('start_time', { ascending: true })
    .limit(limit);

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  // Default: show upcoming events only
  if (!request.nextUrl.searchParams.get('showPast')) {
    query = query.gte('start_time', new Date().toISOString());
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: data || [] });
}

// POST: Create a new calendar event
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, title, startTime, endTime, timezone, participants, meetingLink, location, description } = body;

    if (!userId || !title || !startTime) {
      return NextResponse.json({ error: 'Missing required fields: userId, title, startTime' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('calendar_events')
      .insert({
        user_id: userId,
        title,
        description: description || null,
        start_time: startTime,
        end_time: endTime || null,
        timezone: timezone || 'UTC',
        participants: participants || null,
        meeting_link: meetingLink || null,
        location: location || null,
        status: 'confirmed',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Attempt Google Calendar sync
    try {
      const { createCalendarEvent, isCalendarConnected } = await import('@/lib/google-calendar');
      const connected = await isCalendarConnected(supabaseAdmin, userId);
      if (connected) {
        const googleEventId = await createCalendarEvent(supabaseAdmin, userId, {
          title,
          description,
          startTime,
          endTime,
          timezone,
          meetingLink,
          location,
          participants,
        });
        if (googleEventId && data) {
          await supabaseAdmin
            .from('calendar_events')
            .update({ google_event_id: googleEventId })
            .eq('id', data.id);
        }
      }
    } catch (err) {
      console.log('[Calendar API] Google sync skipped:', err);
    }

    return NextResponse.json({ event: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT: Update event (confirm, cancel, reschedule)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { eventId, status, startTime, endTime } = body;

    if (!eventId) {
      return NextResponse.json({ error: 'Missing eventId' }, { status: 400 });
    }

    const updateData: any = { updated_at: new Date().toISOString() };
    if (status) updateData.status = status;
    if (startTime) updateData.start_time = startTime;
    if (endTime) updateData.end_time = endTime;

    const { data, error } = await supabaseAdmin
      .from('calendar_events')
      .update(updateData)
      .eq('id', eventId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ event: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
