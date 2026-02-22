/**
 * LLM-based Intent Classification Engine
 * Replaces simple command detection with intelligent intent routing
 */

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY || '',
  baseURL: 'https://openrouter.ai/api/v1',
});

// ============================================================
// Types
// ============================================================

export type IntentType =
  | 'retrieval'      // Find documents, messages, files
  | 'meeting'        // Schedule, detect, manage meetings
  | 'reminder'       // Set, check, manage reminders
  | 'commitment'     // Track promises, deadlines
  | 'question'       // General knowledge question about their data
  | 'casual'         // Greeting, thanks, chitchat
  | 'command'        // Explicit bot command (/help, /status, etc.)
  | 'calendar_query' // Check calendar, availability
  | 'unknown';

export interface ExtractedEntities {
  people: string[];
  dates: string[];
  documentTypes: string[];
  topics: string[];
  timeExpressions: string[];
  contactReferences: string[];  // "Tanmay", "mom", "the client"
  fileTypes: string[];          // "pdf", "image", "voice note"
  quantities: number[];         // "last 3", "top 5"
}

export interface ClassifiedIntent {
  intent: IntentType;
  confidence: number;
  entities: ExtractedEntities;
  originalMessage: string;
  suggestedQuery: string;       // Optimized search query for RAG
  requiresConfirmation: boolean;
  confirmationQuestion?: string;
  subIntent?: string;           // e.g., "retrieval.document", "reminder.conditional"
}

// ============================================================
// Classification Prompt
// ============================================================

const CLASSIFICATION_PROMPT = `You are an intent classifier for a WhatsApp AI assistant called Rememora.
The user communicates in natural language. Classify their message into exactly ONE intent.

INTENTS:
- retrieval: User wants to FIND something — documents, files, messages, attachments, conversations, reports, media.
  Examples: "send me my blood test reports", "find the proposal I shared with OROS", "what did Tanmay send me yesterday", "show me the SHA document", "find photos from the trip"

- meeting: User is discussing, scheduling, confirming, or asking about a meeting/call/appointment.
  Examples: "let's meet tomorrow at 3pm", "schedule a call with Imran", "when is my next meeting", "confirmed for 5pm GST"

- reminder: User wants to SET a reminder, follow-up, or check existing reminders.
  Examples: "remind me to follow up with Imran next week", "if Tanmay doesn't reply in 48 hours remind me", "what reminders do I have", "remind me every Monday to check reports"

- commitment: User is making a promise, discussing a deadline, or asking about tracked commitments.
  Examples: "I'll send the deck tomorrow", "what did I promise to deliver", "track this as a deadline", "show my pending commitments"

- question: User is asking a QUESTION about their data/conversations that needs RAG search + reasoning.
  Examples: "when did we discuss VARA licensing", "what was the budget we agreed on", "summarize my conversation with Neha about the project"

- calendar_query: User is checking their calendar or availability.
  Examples: "what's on my calendar today", "am I free tomorrow at 3pm", "show my schedule for this week"

- casual: Greetings, thanks, small talk, or messages that don't need a functional response.
  Examples: "hi", "thanks", "good morning", "ok cool"

- command: Explicit bot commands starting with / or matching known command keywords.
  Examples: "/help", "/status", "help", "status"

ENTITY EXTRACTION:
Extract these from the message:
- people: Names of people mentioned
- dates: Date references ("tomorrow", "last week", "March 15")
- documentTypes: Types of documents ("report", "proposal", "invoice", "blood test")
- topics: Subject matter ("VARA licensing", "budget", "project update")
- timeExpressions: Time phrases ("at 3pm", "in 48 hours", "every Monday", "next week")
- contactReferences: How contacts are referred to ("Tanmay", "mom", "the client", "my team")
- fileTypes: File format references ("pdf", "photo", "voice note", "excel")
- quantities: Numeric references for result count ("last 3", "top 5", "recent 10")

RESPONSE FORMAT (strict JSON):
{
  "intent": "retrieval|meeting|reminder|commitment|question|calendar_query|casual|command",
  "confidence": 0.0-1.0,
  "subIntent": "optional.sub.category",
  "entities": {
    "people": [],
    "dates": [],
    "documentTypes": [],
    "topics": [],
    "timeExpressions": [],
    "contactReferences": [],
    "fileTypes": [],
    "quantities": []
  },
  "suggestedQuery": "optimized search query if retrieval/question intent",
  "requiresConfirmation": false,
  "confirmationQuestion": "optional question if ambiguous"
}`;

// ============================================================
// Main Classification Function
// ============================================================

export async function classifyIntent(message: string): Promise<ClassifiedIntent> {
  const startTime = Date.now();

  // Fast-path: explicit commands
  if (message.startsWith('/')) {
    return createCommandIntent(message);
  }

  // Fast-path: very short casual messages
  const lowerMsg = message.toLowerCase().trim();
  if (lowerMsg.length <= 3 || CASUAL_PATTERNS.some(p => p.test(lowerMsg))) {
    return createCasualIntent(message);
  }

  // Fast-path: known command keywords (exact match)
  const firstWord = lowerMsg.split(/\s+/)[0];
  if (COMMAND_KEYWORDS.includes(firstWord) && message.trim().split(/\s+/).length <= 2) {
    return createCommandIntent(message);
  }

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENROUTER_MODEL || 'qwen/qwen-2.5-72b-instruct',
      messages: [
        { role: 'system', content: CLASSIFICATION_PROMPT },
        { role: 'user', content: message },
      ],
      temperature: 0.1,
      max_tokens: 512,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return createFallbackIntent(message);
    }

    const parsed = JSON.parse(content);
    const processingTime = Date.now() - startTime;

    return {
      intent: validateIntent(parsed.intent),
      confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
      entities: {
        people: parsed.entities?.people || [],
        dates: parsed.entities?.dates || [],
        documentTypes: parsed.entities?.documentTypes || [],
        topics: parsed.entities?.topics || [],
        timeExpressions: parsed.entities?.timeExpressions || [],
        contactReferences: parsed.entities?.contactReferences || [],
        fileTypes: parsed.entities?.fileTypes || [],
        quantities: (parsed.entities?.quantities || []).map(Number).filter((n: number) => !isNaN(n)),
      },
      originalMessage: message,
      suggestedQuery: parsed.suggestedQuery || message,
      requiresConfirmation: parsed.requiresConfirmation || false,
      confirmationQuestion: parsed.confirmationQuestion,
      subIntent: parsed.subIntent,
    };
  } catch (error) {
    console.error('[IntentClassifier] LLM error:', error);
    return createFallbackIntent(message);
  }
}

// ============================================================
// Helpers
// ============================================================

const CASUAL_PATTERNS = [
  /^(hi|hey|hello|yo|sup|morning|evening|night|thanks|thank you|ok|okay|cool|sure|bye|gm|gn)$/i,
  /^(good\s*(morning|evening|night|afternoon))$/i,
  /^(👋|🙏|👍|😊|😂|❤️|🫡)$/,
];

const COMMAND_KEYWORDS = [
  'help', 'status', 'quiet', 'active', 'analytics', 'commitments',
  'insights', 'sentiment', 'brief',
];

const VALID_INTENTS: IntentType[] = [
  'retrieval', 'meeting', 'reminder', 'commitment',
  'question', 'casual', 'command', 'calendar_query', 'unknown',
];

function validateIntent(intent: string): IntentType {
  if (VALID_INTENTS.includes(intent as IntentType)) {
    return intent as IntentType;
  }
  return 'unknown';
}

function createCommandIntent(message: string): ClassifiedIntent {
  return {
    intent: 'command',
    confidence: 1.0,
    entities: emptyEntities(),
    originalMessage: message,
    suggestedQuery: '',
    requiresConfirmation: false,
  };
}

function createCasualIntent(message: string): ClassifiedIntent {
  return {
    intent: 'casual',
    confidence: 0.95,
    entities: emptyEntities(),
    originalMessage: message,
    suggestedQuery: '',
    requiresConfirmation: false,
  };
}

function createFallbackIntent(message: string): ClassifiedIntent {
  // When LLM fails, treat as a question (safest default — will search and try to answer)
  return {
    intent: 'question',
    confidence: 0.5,
    entities: emptyEntities(),
    originalMessage: message,
    suggestedQuery: message,
    requiresConfirmation: false,
  };
}

function emptyEntities(): ExtractedEntities {
  return {
    people: [],
    dates: [],
    documentTypes: [],
    topics: [],
    timeExpressions: [],
    contactReferences: [],
    fileTypes: [],
    quantities: [],
  };
}

// ============================================================
// Intent Logging (async, non-blocking)
// ============================================================

export async function logIntent(
  supabaseAdmin: any,
  userId: string,
  messageId: string | null,
  classified: ClassifiedIntent,
  processingTimeMs: number
): Promise<void> {
  try {
    await supabaseAdmin.from('intent_logs').insert({
      user_id: userId,
      message_id: messageId,
      raw_message: classified.originalMessage,
      classified_intent: classified.intent,
      confidence: classified.confidence,
      entities: classified.entities,
      processing_time_ms: processingTimeMs,
    });
  } catch (error) {
    console.error('[IntentClassifier] Failed to log intent:', error);
  }
}
