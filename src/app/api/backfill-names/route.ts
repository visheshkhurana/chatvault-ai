import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// POST /api/backfill-names
// Backfills chat titles and contact display_names from message sender_name data.
// Uses efficient batch queries (~4 total) instead of N+1 per-row queries.
// This fixes chats/contacts created before pushName propagation was added.

export async function POST(req: Request) {
  try {
    // Auth check
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Get internal user ID
    const { data: dbUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('auth_id', user.id)
      .maybeSingle();

    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = dbUser.id;

    let updatedContacts = 0;
    let updatedChats = 0;

    // ── Step 1: Backfill contacts with phone-only display_names ──

    // 1a. Get all contacts with phone-number-only display_names
    const { data: allContacts } = await supabaseAdmin
      .from('contacts')
      .select('id, display_name, wa_id')
      .eq('user_id', userId);

    const phoneContacts = (allContacts || []).filter(c => {
      const dn = c.display_name || '';
      return /^\d{7,}$/.test(dn.replace(/\D/g, ''));
    });

    if (phoneContacts.length > 0) {
      const contactIds = phoneContacts.map(c => c.id);

      // 1b. ONE query: get messages with real sender_names for these contacts
      const { data: msgs } = await supabaseAdmin
        .from('messages')
        .select('contact_id, sender_name, timestamp')
        .in('contact_id', contactIds)
        .eq('is_from_me', false)
        .not('sender_name', 'is', null)
        .order('timestamp', { ascending: false })
        .limit(5000);

      // Build map: contact_id → most recent real sender_name
      const contactNameMap = new Map<string, string>();
      for (const m of (msgs || [])) {
        if (contactNameMap.has(m.contact_id)) continue;
        const sn = m.sender_name || '';
        if (sn && !/^\d{7,}$/.test(sn.replace(/\D/g, ''))) {
          contactNameMap.set(m.contact_id, sn);
        }
      }

      // 1c. Update contacts (individual updates, but only for matches — typically small)
      for (const [contactId, name] of contactNameMap) {
        await supabaseAdmin
          .from('contacts')
          .update({ display_name: name })
          .eq('id', contactId);
        updatedContacts++;
      }
    }

    // ── Step 2: Backfill chat titles from contacts ──

    // 2a. Get individual chats with phone-number-only titles
    const { data: allChats } = await supabaseAdmin
      .from('chats')
      .select('id, title, wa_chat_id, chat_type')
      .eq('user_id', userId)
      .neq('chat_type', 'group');

    const phoneChats = (allChats || []).filter(c => {
      const t = c.title || '';
      return /^\d{7,}$/.test(t.replace(/\D/g, ''));
    });

    if (phoneChats.length > 0) {
      const waJids = phoneChats.map(c => c.wa_chat_id).filter(Boolean);

      // 2b. ONE query: get contacts with real names matching these JIDs
      const { data: matchContacts } = await supabaseAdmin
        .from('contacts')
        .select('wa_id, display_name')
        .eq('user_id', userId)
        .in('wa_id', waJids);

      const jidNameMap = new Map<string, string>();
      for (const c of (matchContacts || [])) {
        const dn = c.display_name || '';
        if (dn && !/^\d{7,}$/.test(dn.replace(/\D/g, ''))) {
          jidNameMap.set(c.wa_id, dn);
        }
      }

      // 2c. Update chat titles
      for (const chat of phoneChats) {
        const name = jidNameMap.get(chat.wa_chat_id);
        if (name) {
          await supabaseAdmin
            .from('chats')
            .update({ title: name })
            .eq('id', chat.id);
          updatedChats++;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      updatedContacts,
      updatedChats,
      message: `Backfilled ${updatedContacts} contact names and ${updatedChats} chat titles`,
    });
  } catch (err: any) {
    console.error('Backfill error:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
