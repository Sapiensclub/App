import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, Screen, Text } from '@/components/ui';
import {
  getCurrentCoords,
  requestLocationPermission,
} from '@/lib/location/locationProvider';
import { fireSos, loadActiveSos, resolveSos, type FireSosResult, type SosEvent } from '@/lib/sos/sos';
import { useRealtime } from '@/lib/realtime';
import { radius as radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

const HOLD_MS = 1800; // hold-to-activate guard against accidental triggers
const EMERGENCY_NUMBER = '112'; // India's single emergency number

// Best-effort location — SOS must never be blocked waiting on a GPS fix.
async function bestEffortCoords(): Promise<{ lat: number; lng: number } | null> {
  try {
    const granted = await requestLocationPermission();
    if (!granted) return null;
    return await Promise.race([
      getCurrentCoords(),
      new Promise<null>((res) => setTimeout(() => res(null), 4000)),
    ]);
  } catch {
    return null;
  }
}

export default function Sos() {
  const { colors } = useTheme();
  const [active, setActive] = useState<SosEvent | null>(null);
  const [fired, setFired] = useState<FireSosResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [progress, setProgress] = useState(0);

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef(0);
  const firing = useRef(false);

  const load = useCallback(async () => {
    setActive(await loadActiveSos());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useRealtime(active ? `sos-${active.id}` : null, [{ table: 'sos_events', filter: `id=eq.${active?.id}` }], load);

  const clearTimer = () => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  };

  const activate = useCallback(async () => {
    if (firing.current) return;
    firing.current = true;
    clearTimer();
    setProgress(1);
    setActivating(true);
    try {
      const coords = await bestEffortCoords();
      const res = await fireSos(coords);
      setFired(res);
      await load();
    } catch {
      // Offline or server error — the 112 call still works, so surface the
      // screen anyway and let them retry the in-app SOS.
      Alert.alert(
        'Could not reach Sapiens',
        'You may be offline. You can still call 112 directly below.',
      );
      setActive({
        id: 'local',
        user_id: 'me',
        lat: null,
        lng: null,
        created_at: new Date().toISOString(),
        resolved: false,
        resolved_at: null,
        daily_count: 1,
      });
    } finally {
      setActivating(false);
      firing.current = false;
      setProgress(0);
    }
  }, [load]);

  function onHoldStart() {
    if (activating) return;
    startedAt.current = Date.now();
    clearTimer();
    timer.current = setInterval(() => {
      const p = Math.min(1, (Date.now() - startedAt.current) / HOLD_MS);
      setProgress(p);
      if (p >= 1) activate();
    }, 40);
  }

  function onHoldEnd() {
    clearTimer();
    if (!firing.current) setProgress(0);
  }

  useEffect(() => () => clearTimer(), []);

  function call112() {
    Linking.openURL(`tel:${EMERGENCY_NUMBER}`).catch(() =>
      Alert.alert('Could not open dialer', `Please dial ${EMERGENCY_NUMBER} yourself.`),
    );
  }

  async function onSafe() {
    if (active && active.id !== 'local') {
      try {
        await resolveSos(active.id);
      } catch {
        // best-effort; still leave the screen
      }
    }
    router.back();
  }

  if (loading) {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.danger} />
        </View>
      </Screen>
    );
  }

  // ── Active: the SOS is raised ──────────────────────────────────────────────
  if (active) {
    return (
      <Screen scroll={false}>
        <CloseBar onClose={() => router.back()} />
        <View style={styles.activeBody}>
          <View style={[styles.pulse, { backgroundColor: colors.danger }]}>
            <Ionicons name="alert" size={56} color="#FFFFFF" />
          </View>
          <Text variant="title" center style={{ color: colors.danger }}>
            SOS active
          </Text>
          <Text variant="body" tone="secondary" center style={styles.copy}>
            Call 112 now for immediate help. When you&apos;re safe, let us know.
          </Text>
          {fired?.over_limit ? (
            <Text variant="small" tone="faint" center style={styles.copy}>
              You&apos;ve raised SOS {fired.daily_count} times today. That&apos;s okay —
              use it whenever you truly need it.
            </Text>
          ) : null}
        </View>

        <View style={styles.footer}>
          <Pressable onPress={call112} style={[styles.callBtn, { backgroundColor: colors.danger }]}>
            <Ionicons name="call" size={22} color="#FFFFFF" />
            <Text variant="heading" weight="bold" style={{ color: '#FFFFFF' }}>
              Call {EMERGENCY_NUMBER}
            </Text>
          </Pressable>
          <Button label="I'm safe now" variant="secondary" onPress={onSafe} />
        </View>
      </Screen>
    );
  }

  // ── Idle: the guarded hold-to-activate button ──────────────────────────────
  return (
    <Screen scroll={false}>
      <CloseBar onClose={() => router.back()} />
      <View style={styles.idleBody}>
        <Text variant="title" center>
          Emergency SOS
        </Text>
        <Text variant="body" tone="secondary" center style={styles.copy}>
          Press and hold the button to raise an SOS. You can call 112 at any time.
        </Text>

        <Pressable
          onPressIn={onHoldStart}
          onPressOut={onHoldEnd}
          delayLongPress={HOLD_MS}
          style={[styles.holdBtn, { backgroundColor: colors.danger, borderColor: colors.danger }]}
          accessibilityRole="button"
          accessibilityLabel="Press and hold to send SOS"
        >
          {/* Bottom-up fill shows hold progress. */}
          <View
            pointerEvents="none"
            style={[styles.holdFill, { height: `${Math.round(progress * 100)}%`, backgroundColor: 'rgba(255,255,255,0.28)' }]}
          />
          {activating ? (
            <ActivityIndicator color="#FFFFFF" size="large" />
          ) : (
            <>
              <Ionicons name="alert" size={48} color="#FFFFFF" />
              <Text variant="heading" weight="bold" style={{ color: '#FFFFFF' }}>
                {progress > 0 ? 'Keep holding…' : 'Hold for SOS'}
              </Text>
            </>
          )}
        </Pressable>

        <Pressable onPress={call112} style={styles.callLink} hitSlop={8}>
          <Ionicons name="call" size={18} color={colors.danger} />
          <Text variant="label" weight="bold" style={{ color: colors.danger }}>
            Call {EMERGENCY_NUMBER} now
          </Text>
        </Pressable>
      </View>

      <Card style={styles.noteCard}>
        <Text variant="small" tone="secondary">
          SOS is for real emergencies. Calling 112 reaches police, fire, and
          ambulance across India.
        </Text>
      </Card>
    </Screen>
  );
}

function CloseBar({ onClose }: { onClose: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.closeBar}>
      <View style={{ flex: 1 }} />
      <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
        <Ionicons name="close" size={28} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  closeBar: { flexDirection: 'row', alignItems: 'center', paddingTop: spacing.md, paddingBottom: spacing.sm },
  copy: { maxWidth: 340 },

  idleBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  holdBtn: {
    width: 240,
    height: 240,
    borderRadius: 120,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    overflow: 'hidden',
    marginVertical: spacing.lg,
  },
  holdFill: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  callLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },

  activeBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  pulse: {
    width: 128,
    height: 128,
    borderRadius: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  footer: { gap: spacing.md, paddingBottom: spacing.lg },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    minHeight: 60,
  },
  noteCard: { marginBottom: spacing.lg },
});
