/**
 * Google Calendar Integration
 * OAuth2 flow, token management, event CRUD
 */

import { google } from 'googleapis';

// ============================================================
// OAuth2 Setup
// ============================================================

const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

// ============================================================
// Auth URL Generation
// ============================================================

export function getGoogleAuthUrl(userId: string): string {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    state: userId, // Pass userId through OAuth flow
  });
}

// ============================================================
// Token Exchange (callback handler)
// ============================================================

export async function exchangeCodeForTokens(
  supabaseAdmin: any,
  code: string,
  userId: string
): Promise<boolean> {
  try {
    const client = getOAuth2Client();
    const { tokens } = await client.getToken(code);

    await supabaseAdmin
      .from('users')
      .update({
        google_refresh_token: tokens.refresh_token || null,
        google_access_token: tokens.access_token,
        google_token_expiry: tokens.expiry_date
          ? new Date(tokens.expiry_date).toISOString()
          : null,
      })
      .eq('id', userId);

    return true;
  } catch (error) {
    console.error('[GoogleCalendar] Token exchange failed:', error);
    return false;
  }
}

// ============================================================
// Get Valid Access Token (auto-refresh)
// ============================================================

async function getValidToken(
  supabaseAdmin: any,
  userId: string
): Promise<string | null> {
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('google_access_token, google_refresh_token, google_token_expiry')
    .eq('id', userId)
    .single();

  if (!user?.google_refresh_token) return null;

  const expiry = user.google_token_expiry
    ? new Date(user.google_token_expiry)
    : new Date(0);

  // Token still valid (with 5-minute buffer)
  if (user.google_access_token && expiry > new Date(Date.now() + 5 * 60 * 1000)) {
    return user.google_access_token;
  }

  // Refresh the token
  try {
    const client = getOAuth2Client();
    client.setCredentials({ refresh_token: user.google_refresh_token });
    const { credentials } = await client.refreshAccessToken();

    await supabaseAdmin
      .from('users')
      .update({
        google_access_token: credentials.access_token,
        google_token_expiry: credentials.expiry_date
          ? new Date(credentials.expiry_date).toISOString()
          : null,
      })
      .eq('id', userId);

    return credentials.access_token || null;
  } catch (error) {
    console.error('[GoogleCalendar] Token refresh failed:', error);
    return null;
  }
}

// ============================================================
// Create Calendar Event
// ============================================================

interface CalendarEventInput {
  title: string;
  description?: string;
  startTime: string; // ISO
  endTime?: string;
  timezone?: string;
  meetingLink?: string;
  location?: string;
  participants?: Array<{ name: string; phone?: string; email?: string }>;
}

export async function createCalendarEvent(
  supabaseAdmin: any,
  userId: string,
  event: CalendarEventInput
): Promise<string | null> {
  const accessToken = await getValidToken(supabaseAdmin, userId);
  if (!accessToken) return null;

  const client = getOAuth2Client();
  client.setCredentials({ access_token: accessToken });
  const calendar = google.calendar({ version: 'v3', auth: client });

  const tz = event.timezone || 'UTC';
  const endTime = event.endTime || new Date(
    new Date(event.startTime).getTime() + 30 * 60 * 1000
  ).toISOString();

  let description = event.description || '';
  if (event.meetingLink) {
    description += `\n\nMeeting Link: ${event.meetingLink}`;
  }

  const attendees = (event.participants || [])
    .filter(p => p.email)
    .map(p => ({ email: p.email!, displayName: p.name }));

  try {
    const result = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: event.title,
        description,
        location: event.location,
        start: {
          dateTime: event.startTime,
          timeZone: tz,
        },
        end: {
          dateTime: endTime,
          timeZone: tz,
        },
        attendees: attendees.length > 0 ? attendees : undefined,
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 20 },
          ],
        },
      },
    });

    return result.data.id || null;
  } catch (error) {
    console.error('[GoogleCalendar] Event creation failed:', error);
    return null;
  }
}

// ============================================================
// Check Calendar Conflicts
// ============================================================

export async function checkConflicts(
  supabaseAdmin: any,
  userId: string,
  startTime: string,
  endTime: string
): Promise<Array<{ title: string; startTime: string; endTime: string }>> {
  const accessToken = await getValidToken(supabaseAdmin, userId);
  if (!accessToken) return [];

  const client = getOAuth2Client();
  client.setCredentials({ access_token: accessToken });
  const calendar = google.calendar({ version: 'v3', auth: client });

  try {
    const result = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startTime,
      timeMax: endTime,
      singleEvents: true,
      orderBy: 'startTime',
    });

    return (result.data.items || []).map(e => ({
      title: e.summary || 'Untitled Event',
      startTime: e.start?.dateTime || e.start?.date || '',
      endTime: e.end?.dateTime || e.end?.date || '',
    }));
  } catch (error) {
    console.error('[GoogleCalendar] Conflict check failed:', error);
    return [];
  }
}

// ============================================================
// Get Upcoming Events
// ============================================================

export async function getUpcomingEvents(
  supabaseAdmin: any,
  userId: string,
  maxResults: number = 10
): Promise<Array<{ id: string; title: string; startTime: string; endTime: string; link?: string }>> {
  const accessToken = await getValidToken(supabaseAdmin, userId);
  if (!accessToken) return [];

  const client = getOAuth2Client();
  client.setCredentials({ access_token: accessToken });
  const calendar = google.calendar({ version: 'v3', auth: client });

  try {
    const result = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      maxResults,
      singleEvents: true,
      orderBy: 'startTime',
    });

    return (result.data.items || []).map(e => ({
      id: e.id || '',
      title: e.summary || 'Untitled Event',
      startTime: e.start?.dateTime || e.start?.date || '',
      endTime: e.end?.dateTime || e.end?.date || '',
      link: e.hangoutLink || e.htmlLink || undefined,
    }));
  } catch (error) {
    console.error('[GoogleCalendar] List events failed:', error);
    return [];
  }
}

// ============================================================
// Check if user has Google Calendar connected
// ============================================================

export async function isCalendarConnected(
  supabaseAdmin: any,
  userId: string
): Promise<boolean> {
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('google_refresh_token')
    .eq('id', userId)
    .single();

  return !!user?.google_refresh_token;
}
