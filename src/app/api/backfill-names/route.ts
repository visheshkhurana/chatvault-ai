import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// POST /api/backfill-names
// Backfills chat titles and contact display_names from message sender_name data.
// This fixes chats/contacts that were created before pushName propagation was added.

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

    let updatedChats = 0;
    let updatedContacts = 0;

    // 1. Find chats with phone-number-only titles
    const { data: chats } = await supabaseAdmin
      .from('chats')
      .select('id, title, wa_chat_id, chat_type')
      .eq('user_id', userId);

    for (const chat of (chats || [])) {
      const title = chat.title || '';
      const isPhoneTitle = /^\d{7,}$/.test(title.replace(/\D/g, ''));
      if (!isPhoneTitle || chat.chat_type === 'group') continue;

      // Look up the best sender_name from messages in this chat (non-self messages)
      const { data: recentMsg } = await supabaseAdmin
        .from('messages')
        .select('sender_name')
        .eq('chat_id', chat.id)
        .eq('is_from_me', false)
        .not('sender_name', 'is', null)
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentMsg?.sender_name) {
        const sn = recentMsg.sender_name;
        const isRealName = sn && !/^\d{7,}$/.test(sn.replace(/\D/g, ''));
        if (isRealName) {
          await supabaseAdmin
            .from('chats')
            .update({ title: sn })
            .eq('id', chat.id);
          updatedChats++;
        }
      }
    }

    // 2. Fix contacts with phone-number-only display_names
    const { data: contacts } = await supabaseAdmin
      .from('contacts')
      .select('id, display_name, wa_id')
      .eq('user_id', userId);

    for (const contact of (contacts || [])) {
      const dn = contact.display_name || '';
      const isPhoneName = /^\d{7,}$/.test(dn.replace(/\D/g, ''));
      if (!isPhoneName) continue;

      // Find best sender_name from messages by this contact
      const { data: msg } = await supabaseAdmin
        .from('messages')
        .select('sender_name')
        .eq('contact_id', contact.id)
        .eq('is_from_me', false)
        .not('sender_name', 'is', null)
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (msg?.sender_name) {
        const sn = msg.sender_name;
        const isRealName = sn && !/^\d{7,}$/.test(sn.replace(/\D/g, ''));
        if (isRealName) {
          await supabaseAdmin
            .from('contacts')
            .update({ display_name: sn })
            .eq('id', contact.id);
          updatedContacts++;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      updatedChats,
      updatedContacts,
      message: `Backfilled ${updatedChats} chat titles and ${updatedContacts} contact names`,
    });
  } catch (err: any) {
    console.error('Backfill error:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
