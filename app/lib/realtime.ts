import { useEffect, useRef } from 'react';

import { supabase } from './supabase';

type Sub = {
  table: string;
  filter?: string;
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
};

/**
 * One safe way to subscribe to Postgres changes. Fixes the class of bug where
 * a fixed channel name + a changing callback caused "cannot add postgres_changes
 * callbacks after subscribe()":
 *   · the channel gets a UNIQUE name each subscribe (no topic collision on
 *     remount / StrictMode double-invoke), and
 *   · the effect re-runs only when the subscription SHAPE changes (name + tables
 *     + filters), never when the callback identity changes — the latest callback
 *     is read through a ref.
 *
 * Pass `baseName = null` (or enabled=false) to not subscribe yet.
 */
export function useRealtime(
  baseName: string | null,
  subs: Sub[],
  onChange: () => void,
) {
  const cb = useRef(onChange);
  cb.current = onChange;

  const signature =
    baseName === null
      ? null
      : baseName +
        '::' +
        subs.map((s) => `${s.table}|${s.filter ?? ''}|${s.event ?? '*'}`).join(',');

  useEffect(() => {
    if (baseName === null) return;
    const channel = supabase.channel(`${baseName}-${Math.random().toString(36).slice(2)}`);
    for (const s of subs) {
      const config = {
        event: s.event ?? '*',
        schema: 'public',
        table: s.table,
        filter: s.filter,
      } as never; // supabase's postgres_changes overloads don't accept a dynamic config
      channel.on('postgres_changes', config, () => cb.current());
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // signature captures baseName + subs shape; callback is read via ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
}
