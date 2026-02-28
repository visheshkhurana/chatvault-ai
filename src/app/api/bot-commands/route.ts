import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withAuth, parseBody, apiSuccess, apiError } from '@/lib/api-utils';
import { hybridSearch } from '@/lib/embeddings';
import { generateChatSummary } from '@/lib/rag';
import { z } from 'zod';

// ============================================================
// Bot Commands API — WhatsApp bot command processing
// POST /api/bot-commands — Process a WhatsApp bot command
// ============================================================

const botCommandSchema = z.object({
  command: z.string().min(1),
  rawInput: z.string(),
  userPhone: z.string().min(1),
});

export const POST = withAuth(async (req: NextRequest, { user }) => {
  const parsed = await parseBody(req, botCommandSchema);
  if (!parsed.success) return parsed.response;

  const { command, rawInput, userPhone } = parsed.data as z.infer<typeof botCommandSchema>;

  try {
    const commandLower = command.toLowerCase().trim();
    let response = '';

    // /search [query]
    if (commandLower.startsWith('/search ')) {
      const query = rawInput.replace(/^\/search\s+/i, '').trim();
      if (!query) {
        response = 'Please provide a search query. Example: /search meetings with john';
      } else {
        const results = await hybridSearch({
          userId: user.id,
          query,
          matchCount: 5,
        });
        if (results.length === 0) {
          response = `No results found for "${query}".`;
        } else {
          response = 'Found ' + results.length + ' results:\n';
          results.forEach((r, i) => {
            response += `${i + 1}. ${r.chunk_text.substring(0, 100)}...\n`;
          });
        }
      }
    }
    // /remind [text] [time]
    else if (commandLower.startsWith('/remind ')) {
      response = 'Reminder feature via WhatsApp coming soon. Use the web app for reminders.';
    }
    // /summary [contact]
    else if (commandLower.startsWith('/summary ')) {
      const contactName = rawInput.replace(/^\/summary\s+/i, '').trim();
      if (!contactName) {
        response = 'Please provide a contact name. Example: /summary john';
      } else {
        // Find contact and most recent chat
        const { data: contacts } = await supabaseAdmin
          .from('contacts')
          .select('id')
          .eq('user_id', user.id)
          .ilike('display_name', `%${contactName}%`)
          .limit(1);

        if (!contacts?.length) {
          response = `Contact "${contactName}" not found.`;
        } else {
          const { data: chats } = await supabaseAdmin
            .from('chats')
            .select('id')
            .eq('user_id', user.id)
            .match({ 'contact_id': contacts[0].id })
            .limit(1);

          if (!chats?.length) {
            response = `No chat found with ${contactName}.`;
          } else {
            try {
              const summary = await generateChatSummary({
                userId: user.id,
                chatId: chats[0].id,
                dateFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
                dateTo: new Date().toISOString(),
              });
              response = `Summary of ${contactName}:\n${summary.summary}`;
            } catch {
              response = `Error generating summary for ${contactName}.`;
            }
          }
        }
      }
    }
    // /commitments
    else if (commandLower === '/commitments') {
      const { data: commitments } = await supabaseAdmin
        .from('commitments')
        .select('description, due_date, status')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(5);

      if (!commitments?.length) {
        response = 'No pending commitments.';
      } else {
        response = 'Your pending commitments:\n';
        commitments.forEach((c, i) => {
          const due = c.due_date ? new Date(c.due_date).toLocaleDateString() : 'No date';
          response += `${i + 1}. ${c.description} (due ${due})\n`;
        });
      }
    }
    // /help
    else if (commandLower === '/help') {
      response = `Available commands:
/search [query] - Search your messages
/summary [contact] - Get a summary of conversation with contact
/commitments - List pending commitments
/help - Show this message`;
    }
    // Unknown command
    else {
      response = `Unknown command: ${command}. Type /help for available commands.`;
    }

    // Log command
    await supabaseAdmin.from('bot_commands').insert({
      user_id: user.id,
      command: commandLower,
      raw_input: rawInput,
      user_phone: userPhone,
      response,
      processed_at: new Date().toISOString(),
    });

    return apiSuccess({ response });
  } catch (err) {
    console.error('[Bot Commands] Error:', err);
    return apiError('Failed to process command', 500);
  }
});
