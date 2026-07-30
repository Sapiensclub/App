import * as Location from 'expo-location';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/lib/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { getCurrentCoords } from './locationProvider';

const SYNC_EVERY_MS = 5 * 60 * 1000; // 5 min while the app is open

/**
 * Keeps helper_preferences.last_location fresh while the app is foregrounded,
 * so the dispatch engine can find this user as a nearby helper. Never prompts:
 * it syncs only if location permission was already granted elsewhere (raising
 * a request, or the helper flow). Availability stays implicit (PRD 3.1).
 */
export function useLocationSync() {
  const { session } = useAuth();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!session) return;

    let cancelled = false;

    async function syncOnce() {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;
        const coords = await getCurrentCoords();
        if (cancelled) return;
        await supabase.rpc('update_my_location', {
          p_lat: coords.lat,
          p_lng: coords.lng,
        });
      } catch {
        // Location sync is best-effort — never surface errors for it.
      }
    }

    function start() {
      syncOnce();
      if (!timer.current) {
        timer.current = setInterval(syncOnce, SYNC_EVERY_MS);
      }
    }
    function stop() {
      if (timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
    }

    start();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') start();
      else stop();
    });

    return () => {
      cancelled = true;
      stop();
      sub.remove();
    };
  }, [session]);
}
