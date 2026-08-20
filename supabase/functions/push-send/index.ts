// ============================================================================
// SAPIENS — push-send Edge Function (T1)
// ============================================================================
// Called by DB triggers (via pg_net) with { source: 'ping'|'notification'|
// 'message', id: uuid }. Resolves the recipient(s) + staged-disclosure-safe
// copy, then POSTs to the Expo Push API for every registered device token.
//
// Auth: shared secret header (x-push-secret) — must equal PUSH_WEBHOOK_SECRET.
// Deploy:  npx supabase functions deploy push-send
// Secrets: npx supabase secrets set PUSH_WEBHOOK_SECRET=<random>
//          npx supabase secrets set EXPO_ACCESS_TOKEN=<expo token>   (optional,
//          required only if Expo "enhanced push security" is enabled)
// Then set dispatch_config keys push_fn_url + push_fn_secret (see the T1
// migration header) — until then the DB side stays silently off.
//
// Copy rules (the constitution): a push to a stranger NEVER contains seeker
// identity — pings show category only. Directed pings (PRD 5.5) may name the
// asker, because that reveal is the feature. Inbox message pushes carry no
// message content (inbox is private); active-chat pushes carry text (that chat
// is already server-readable coordination).
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

type Outgoing = {
  recipients: string[];
  title: string;
  body: string;
  /** expo-router path the app opens when the push is tapped (wired in T2). */
  url: string;
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

// ---------------------------------------------------------------------------
// Source resolvers → who gets what copy. Return null to skip silently.
// ---------------------------------------------------------------------------

/** A helper was pinged (dispatch_targets row). */
async function resolvePing(id: string): Promise<Outgoing | null> {
  const { data: dt } = await supabase
    .from('dispatch_targets')
    .select('helper_id, request_id')
    .eq('id', id)
    .maybeSingle();
  if (!dt) return null;

  const { data: r } = await supabase
    .from('requests')
    .select('id, seeker_id, category_id, is_directed, directed_to, status, is_online')
    .eq('id', dt.request_id)
    .maybeSingle();
  if (!r || r.status !== 'open') return null; // stale by the time we run

  const { data: cat } = await supabase
    .from('categories')
    .select('label')
    .eq('id', r.category_id)
    .maybeSingle();
  const label = cat?.label ?? 'something';

  // Directed ask: the named connection may see who's asking (PRD 5.5).
  if (r.is_directed && r.directed_to === dt.helper_id) {
    const { data: seeker } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', r.seeker_id)
      .maybeSingle();
    return {
      recipients: [dt.helper_id],
      title: `${seeker?.display_name ?? 'A connection'} is asking you`,
      body: `They'd like your help with ${label}.`,
      url: `/help/${r.id}`,
    };
  }

  // Open ping: category only — never who or exactly where.
  if (r.is_online) {
    return {
      recipients: [dt.helper_id],
      title: 'Someone needs a hand — online',
      body: `${label} — you can help from anywhere. Open Sapiens if you're free.`,
      url: `/help/${r.id}`,
    };
  }
  return {
    recipients: [dt.helper_id],
    title: 'Someone nearby needs a hand',
    body: `${label} — open Sapiens if you can help.`,
    url: `/help/${r.id}`,
  };
}

/** A bell notification row — mirror app/lib/notifications.ts copy. */
async function resolveNotification(id: string): Promise<Outgoing | null> {
  const { data: n } = await supabase
    .from('notifications')
    .select('user_id, type, payload')
    .eq('id', id)
    .maybeSingle();
  if (!n) return null;

  const p = (n.payload ?? {}) as Record<string, unknown>;
  const str = (v: unknown, fallback: string) =>
    typeof v === 'string' && v.trim() ? v : fallback;

  let title = 'Sapiens';
  let body = '';
  switch (n.type) {
    case 'hand_raised':
      title = 'Someone can help';
      body = `A verified neighbour raised their hand for your ${str(p.category, 'request')}.`;
      break;
    case 'you_were_confirmed':
      title = `You're helping ${str(p.other_name, 'a neighbour')}`;
      body = 'They confirmed you. Tap to see the details.';
      break;
    case 'help_completed':
      title = 'Help complete';
      body = `Your help with ${str(p.other_name, 'a neighbour')} is done.`;
      break;
    case 'new_connection':
      title = 'New connection';
      body = `You and ${str(p.other_name, 'a neighbour')} are now connected.`;
      break;
    case 'connection_milestone':
      title = `${str(p.other_name, 'A connection')} reached a milestone`;
      body = 'Celebrate with them.';
      break;
    case 'moment_pending':
      title = 'A moment to approve';
      body = 'Someone wants to share a moment with you.';
      break;
    default:
      return null; // unknown types stay in-app only
  }
  return { recipients: [n.user_id], title, body, url: '/notifications' };
}

/** A chat message → push the other open participants. */
async function resolveMessage(id: string): Promise<Outgoing | null> {
  const { data: m } = await supabase
    .from('messages')
    .select('chat_id, sender_id, type, body')
    .eq('id', id)
    .maybeSingle();
  if (!m) return null;

  const { data: chat } = await supabase
    .from('chats')
    .select('kind, request_id')
    .eq('id', m.chat_id)
    .maybeSingle();
  if (!chat) return null;

  const { data: parts } = await supabase
    .from('chat_participants')
    .select('user_id')
    .eq('chat_id', m.chat_id)
    .is('left_at', null);
  const recipients = (parts ?? [])
    .map((x) => x.user_id as string)
    .filter((uid) => uid !== m.sender_id);
  if (!recipients.length) return null;

  const { data: sender } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', m.sender_id)
    .maybeSingle();
  const name = sender?.display_name ?? 'New message';

  // Active chat = already server-readable coordination → content helps.
  // Inbox = private and permanent → the push says only that something arrived.
  const body =
    chat.kind === 'active'
      ? m.type === 'text'
        ? truncate(m.body ?? '', 120)
        : m.type === 'photo'
          ? '📷 Photo'
          : '🎤 Voice note'
      : 'New message';

  const url =
    chat.kind === 'active'
      ? `/chat/${chat.request_id}`
      : `/connections/inbox/${m.sender_id}`;

  return { recipients, title: name, body, url };
}

// ---------------------------------------------------------------------------
// Expo Push delivery + dead-token cleanup.
// ---------------------------------------------------------------------------

async function deliver(out: Outgoing): Promise<{ sent: number; dead: number }> {
  const { data: tokens } = await supabase
    .from('push_tokens')
    .select('expo_token')
    .in('user_id', out.recipients);
  if (!tokens?.length) return { sent: 0, dead: 0 };

  const messages = tokens.map((t) => ({
    to: t.expo_token as string,
    title: out.title,
    body: out.body,
    sound: 'default' as const,
    channelId: 'default',
    data: { url: out.url },
  }));

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  const expoToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (expoToken) headers.Authorization = `Bearer ${expoToken}`;

  let sent = 0;
  const dead: string[] = [];
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers,
      body: JSON.stringify(chunk),
    });
    const payload = await res.json().catch(() => null);
    const tickets: unknown[] = Array.isArray(payload?.data) ? payload.data : [];
    tickets.forEach((t, j) => {
      const ticket = t as { status?: string; details?: { error?: string } };
      if (ticket?.status === 'ok') sent += 1;
      else if (ticket?.details?.error === 'DeviceNotRegistered') dead.push(chunk[j].to);
    });
  }

  // A token that Expo says is gone (app uninstalled) is pruned immediately.
  if (dead.length) {
    await supabase.from('push_tokens').delete().in('expo_token', dead);
  }
  return { sent, dead: dead.length };
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('PUSH_WEBHOOK_SECRET');
  if (!secret || req.headers.get('x-push-secret') !== secret) {
    return json({ error: 'unauthorized' }, 401);
  }

  let source = '';
  let id = '';
  try {
    const parsed = await req.json();
    source = String(parsed?.source ?? '');
    id = String(parsed?.id ?? '');
  } catch {
    return json({ error: 'bad request' }, 400);
  }
  if (!source || !id) return json({ error: 'bad request' }, 400);

  const out =
    source === 'ping'
      ? await resolvePing(id)
      : source === 'notification'
        ? await resolveNotification(id)
        : source === 'message'
          ? await resolveMessage(id)
          : null;

  if (!out) return json({ sent: 0, skipped: true });
  const result = await deliver(out);
  return json(result);
});
