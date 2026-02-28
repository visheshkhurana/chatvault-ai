# WhatsApp AI Operating Layer — Implementation Plan

## What Already Exists (DO NOT REBUILD)
- WhatsApp Cloud API webhook (`/api/webhook/whatsapp/route.ts`)
- Message ingestion, contact/chat creation pipeline
- RAG pipeline: `hybridSearch()` + `queryRAG()` in `src/lib/rag.ts`
- Embeddings: `storeEmbeddings()`, `searchEmbeddings()` in `src/lib/embeddings.ts`
- WhatsApp messaging: `sendTextMessage()` in `src/lib/whatsapp.ts`
- Reminder table + CRUD API (`/api/reminders/`)
- Commitment table + tracking
- Bot commands: find, search, remind, brief, status, etc.
- Natural language date parser: `parseNaturalDate()`
- Cron infrastructure (`/api/cron/summaries/`)
- Backblaze B2 file storage + signed URLs
- Supabase auth + RLS + admin client

## What Needs to Be Built

### Phase 1: Smart Intent Classification + Enhanced Retrieval
**Files to create/modify:**

1. **`src/lib/intent-classifier.ts`** (NEW)
   - LLM-based intent classification replacing simple command detection
   - Intents: `retrieval`, `meeting`, `reminder`, `commitment`, `question`, `casual`, `command`
   - Entity extraction: people, dates, document types, topics
   - Confidence scoring (0-1)
   - Falls back to existing command handler for explicit commands (/help, /status, etc.)

   ```typescript
   interface ClassifiedIntent {
     intent: 'retrieval' | 'meeting' | 'reminder' | 'commitment' | 'question' | 'casual' | 'command';
     confidence: number;
     entities: {
       people: string[];
       dates: string[];
       documentTypes: string[];
       topics: string[];
       timeExpressions: string[];
     };
     originalMessage: string;
     suggestedQuery?: string; // optimized search query
   }
   ```

2. **`src/lib/whatsapp.ts`** (MODIFY — add media sending)
   - Add `sendDocumentMessage(to, mediaUrl, caption, filename)`
   - Add `sendImageMessage(to, mediaUrl, caption)`
   - Add `uploadMediaToWhatsApp(buffer, mimeType)` → returns media_id
   - Add `sendMediaById(to, mediaId, type, caption)`
   - Uses WhatsApp Cloud API media endpoints

3. **`src/lib/retrieval-engine.ts`** (NEW)
   - Wraps existing `queryRAG()` + `hybridSearch()`
   - Adds smart entity-aware search:
     - If person mentioned → filter by contact
     - If doc type mentioned → filter attachments by type
     - If date mentioned → apply date range
   - Re-ranks results by recency + relevance blend
   - Fetches actual files from B2 storage
   - Generates download URLs or uploads to WhatsApp
   - Returns formatted WhatsApp response with files

4. **Modify `src/app/api/webhook/whatsapp/route.ts`**
   - Replace `isCommand()` + `handleBotCommand()` + `handleConversationalAI()` flow with:
     1. If message starts with `/` → existing command handler (backward compat)
     2. Otherwise → `classifyIntent()` → route to appropriate handler
   - Keep all existing message storage/embedding pipeline untouched
   - Add new handler functions: `handleRetrieval()`, `handleMeetingDetection()`, `handleSmartReminder()`, `handleCommitmentDetection()`

### Phase 2: Meeting Detection + Google Calendar
**Files to create/modify:**

5. **Database migration: `migrations/004_meetings_calendar.sql`** (NEW)
   ```sql
   CREATE TABLE calendar_events (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
     chat_id UUID REFERENCES chats(id),
     source_message_id UUID REFERENCES messages(id),
     title TEXT NOT NULL,
     description TEXT,
     start_time TIMESTAMPTZ NOT NULL,
     end_time TIMESTAMPTZ,
     timezone TEXT DEFAULT 'UTC',
     participants JSONB DEFAULT '[]',
     meeting_link TEXT,
     location TEXT,
     google_event_id TEXT,
     conversation_context TEXT,
     status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed','tentative','cancelled','rescheduled')),
     reminder_sent BOOLEAN DEFAULT FALSE,
     reminder_sent_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW()
   );
   CREATE INDEX idx_calendar_events_user ON calendar_events(user_id, start_time);
   CREATE INDEX idx_calendar_events_reminder ON calendar_events(user_id, status, reminder_sent, start_time);

   -- Enhance existing reminders table
   ALTER TABLE reminders ADD COLUMN IF NOT EXISTS trigger_type TEXT DEFAULT 'time' CHECK (trigger_type IN ('time','conditional','recurring'));
   ALTER TABLE reminders ADD COLUMN IF NOT EXISTS condition_json JSONB;
   ALTER TABLE reminders ADD COLUMN IF NOT EXISTS recurrence_rule TEXT;
   ALTER TABLE reminders ADD COLUMN IF NOT EXISTS source_message_id UUID REFERENCES messages(id);
   ALTER TABLE reminders ADD COLUMN IF NOT EXISTS context_summary TEXT;

   -- Add google tokens to users table
   ALTER TABLE users ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;
   ALTER TABLE users ADD COLUMN IF NOT EXISTS google_access_token TEXT;
   ALTER TABLE users ADD COLUMN IF NOT EXISTS google_token_expiry TIMESTAMPTZ;
   ALTER TABLE users ADD COLUMN IF NOT EXISTS bot_mode TEXT DEFAULT 'active';
   ```

6. **`src/lib/google-calendar.ts`** (NEW)
   - OAuth2 flow: `getAuthUrl(userId)`, `handleCallback(code, userId)`
   - Token management: `getValidToken(userId)` with auto-refresh
   - `createEvent(userId, event)` → Google Calendar API
   - `checkConflicts(userId, startTime, endTime)` → returns overlapping events
   - `updateEvent(userId, eventId, updates)`
   - `deleteEvent(userId, eventId)`
   - Uses googleapis npm package (to be added)

7. **`src/lib/meeting-detector.ts`** (NEW)
   - LLM-based meeting detection from message content
   - Extracts: date, time, timezone, participants, meeting link, topic
   - Handles ambiguous times ("tomorrow evening" → asks user to confirm)
   - Handles timezone normalization (user's timezone from profile)
   - Returns structured `MeetingCandidate` object
   - Confirms with user before creating calendar event

   ```typescript
   interface MeetingCandidate {
     detected: boolean;
     confidence: number;
     title: string;
     startTime: string; // ISO
     endTime?: string;
     timezone: string;
     participants: { name: string; phone?: string }[];
     meetingLink?: string;
     location?: string;
     needsConfirmation: boolean;
     ambiguities: string[];
     conversationContext: string;
   }
   ```

8. **`src/app/api/auth/google/route.ts`** (NEW)
   - GET: Returns Google OAuth URL for calendar permission
   - Redirects back after auth with code

9. **`src/app/api/auth/google/callback/route.ts`** (NEW)
   - Exchanges code for tokens
   - Stores refresh_token in users table
   - Redirects to dashboard with success status

### Phase 3: Smart Reminders + Meeting Reminders Cron
**Files to create/modify:**

10. **`src/lib/smart-reminder.ts`** (NEW)
    - Enhanced reminder parsing with LLM
    - Supports:
      - Time-based: "Remind me to X tomorrow at 3pm"
      - Conditional: "If Tanmay doesn't reply in 48 hours, remind me"
      - Recurring: "Remind me every Monday to check X"
      - Follow-up: "Remind me to follow up with Imran next week"
    - Stores condition_json for conditional triggers:
      ```json
      {
        "type": "no_reply",
        "contact_wa_id": "919876543210",
        "chat_id": "uuid",
        "wait_hours": 48,
        "check_after": "2025-02-25T10:00:00Z"
      }
      ```
    - Stores recurrence_rule for recurring:
      ```
      "FREQ=WEEKLY;BYDAY=MO;BYHOUR=9"
      ```

11. **`src/app/api/cron/reminders/route.ts`** (NEW)
    - Runs every 5 minutes (Vercel cron or external trigger)
    - Checks:
      a. Time-based reminders where `due_at <= NOW()` and status = 'pending'
      b. Conditional reminders: queries messages table to check if condition met
      c. Recurring reminders: checks if next occurrence is due
      d. Calendar events starting in ~20 minutes where `reminder_sent = false`
    - For calendar reminders:
      - Fetches event's `conversation_context`
      - Generates fresh 3-line summary via LLM
      - Sends WhatsApp message with: meeting link, participants, context summary, key topics
      - Updates `reminder_sent = true`
    - For conditional ("no reply") reminders:
      - Queries recent messages from target contact
      - If no reply found after wait period → fires reminder
      - If reply found → auto-marks reminder as done

12. **`src/app/api/cron/commitments/route.ts`** (NEW)
    - Runs daily
    - Scans recent messages for commitment patterns using LLM
    - Stores detected commitments
    - Sends digest of upcoming/overdue commitments via WhatsApp

### Phase 4: Commitment Auto-Detection
**Files to create/modify:**

13. **`src/lib/commitment-detector.ts`** (NEW)
    - LLM-based scanning of message content for:
      - Promises: "I'll send the deck tomorrow"
      - Deadlines: "Need this by Friday"
      - Payment commitments: "Will transfer the amount by EOD"
      - Deliverables: "I'll prepare the proposal"
    - When detected, sends private confirmation:
      "📌 Detected commitment: 'Send the deck tomorrow'
       Should I set a reminder for tomorrow at 10am? (yes/no)"
    - On confirmation → creates reminder + commitment entry

---

## File Structure (New files only)

```
src/
├── lib/
│   ├── intent-classifier.ts      (NEW) Intent classification engine
│   ├── retrieval-engine.ts        (NEW) Smart document retrieval
│   ├── meeting-detector.ts        (NEW) Meeting detection + extraction
│   ├── smart-reminder.ts          (NEW) Enhanced reminder system
│   ├── commitment-detector.ts     (NEW) Auto-detect commitments
│   ├── google-calendar.ts         (NEW) Google Calendar integration
│   ├── whatsapp.ts                (MODIFY) Add media sending
│   ├── rag.ts                     (UNCHANGED)
│   ├── embeddings.ts              (UNCHANGED)
│   ├── storage.ts                 (UNCHANGED)
│   └── supabase.ts                (UNCHANGED)
├── app/api/
│   ├── webhook/whatsapp/route.ts  (MODIFY) New intent-based routing
│   ├── auth/google/route.ts       (NEW) Google OAuth start
│   ├── auth/google/callback/route.ts (NEW) Google OAuth callback
│   ├── cron/
│   │   ├── reminders/route.ts     (NEW) Reminder + calendar cron
│   │   ├── commitments/route.ts   (NEW) Commitment detection cron
│   │   └── summaries/route.ts     (UNCHANGED)
│   └── calendar/route.ts          (NEW) Calendar CRUD API
└── migrations/
    └── 004_meetings_calendar.sql  (NEW)
```

## Implementation Order

1. **Migration** — Run `004_meetings_calendar.sql` to add calendar_events table + alter reminders/users
2. **`intent-classifier.ts`** — Core routing brain (everything depends on this)
3. **`retrieval-engine.ts`** — Smart doc retrieval with file sending
4. **Modify `whatsapp.ts`** — Add media sending capabilities
5. **Modify webhook `route.ts`** — Wire intent classifier into message flow
6. **`meeting-detector.ts`** — Meeting extraction from messages
7. **`google-calendar.ts`** + OAuth routes — Calendar API integration
8. **`smart-reminder.ts`** — Enhanced reminder parsing
9. **`commitment-detector.ts`** — Auto-detection engine
10. **`cron/reminders/route.ts`** — Unified cron for reminders + calendar alerts
11. **`cron/commitments/route.ts`** — Daily commitment scan
12. **`calendar/route.ts`** — Dashboard calendar API

## New Dependencies
- `googleapis` — Google Calendar API
- (all others already installed: openai, date-fns, compromise, supabase, etc.)

## Environment Variables (New)
```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://yourdomain.com/api/auth/google/callback
CRON_SECRET= (already exists)
```

## Security Notes
- Google tokens encrypted column-level (or at minimum server-side only access)
- All calendar operations scoped by user_id
- Webhook signature verification unchanged
- Rate limiting on all new endpoints
- Intent classifier never exposes internal errors to user
- Conditional reminders bounded: max 30 day wait, max 10 active per user
