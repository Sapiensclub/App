import { Ionicons } from '@expo/vector-icons';

import { celestialInfo } from '@/lib/celestial';
import { supabase } from '@/lib/supabase';

// The in-app notification inbox (PRD 10.12). Rows are written by DB triggers;
// the client reads its own, marks read (RLS-scoped), and renders copy here so
// the wording lives in one place.

export type AppNotification = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  read: boolean;
  created_at: string;
};

export async function loadNotifications(): Promise<AppNotification[]> {
  const { data } = await supabase
    .from('notifications')
    .select('id, type, payload, read, created_at')
    .order('created_at', { ascending: false })
    .limit(50);
  return (data ?? []) as AppNotification[];
}

export async function unreadCount(): Promise<number> {
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('read', false);
  return count ?? 0;
}

/** Mark all of the caller's unread notifications read (RLS scopes to owner). */
export async function markAllRead(): Promise<void> {
  await supabase.from('notifications').update({ read: true }).eq('read', false);
}

type Described = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
};

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim() ? v : fallback;
}

/** Human copy + icon for a notification. Kept here so wording is centralized. */
export function describeNotification(n: AppNotification): Described {
  const p = n.payload ?? {};
  switch (n.type) {
    case 'hand_raised':
      return {
        icon: 'hand-left',
        title: 'Someone can help',
        body: `A verified neighbour raised their hand for your ${str(p.category, 'request')}.`,
      };
    case 'you_were_confirmed':
      return {
        icon: 'checkmark-circle',
        title: `You're helping ${str(p.other_name, 'a neighbour')}`,
        body: 'They confirmed you. Tap to see the details.',
      };
    case 'help_completed':
      return {
        icon: 'sparkles',
        title: 'Help complete',
        body: `Your help with ${str(p.other_name, 'a neighbour')} is done.`,
      };
    case 'new_connection':
      return {
        icon: 'people',
        title: 'New connection',
        body: `You and ${str(p.other_name, 'a neighbour')} are now connected.`,
      };
    case 'connection_milestone':
      return {
        icon: 'star',
        title: `${str(p.other_name, 'A connection')} reached a milestone`,
        body: `They're now ${celestialInfo(str(p.stage, 'new_moon')).label}. Celebrate with them.`,
      };
    default:
      return { icon: 'notifications', title: 'Update', body: '' };
  }
}
