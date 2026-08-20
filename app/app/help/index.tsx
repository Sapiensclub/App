import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { EmptyState, Screen, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth/AuthProvider';
import type { HelperPing } from '@/lib/help/matching';
import { timeAgo } from '@/lib/help/timeAgo';
import {
  distanceLabel,
  getCurrentCoords,
  requestLocationPermission,
} from '@/lib/location/locationProvider';
import { useRealtime } from '@/lib/realtime';
import { supabase } from '@/lib/supabase';
import { radius as radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

const URGENCY_RANK: Record<string, number> = { sos: 0, urgent: 1, everyday: 2, casual: 3 };
const URGENCY_LABEL: Record<string, string> = {
  sos: 'SOS',
  urgent: 'Right now',
  everyday: 'Today',
  casual: 'Whenever',
};

// The bounded "Help now" list (PRD 10.6): finite, matched to the helper's
// categories, nearby, with a bottom. Ordered urgent-first then nearest. Shows
// only the limited pre-accept info — the server view enforces that.
export default function HelpNow() {
  const { colors } = useTheme();
  const { session } = useAuth();
  const [pings, setPings] = useState<HelperPing[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('helper_pings')
      .select('*')
      .eq('outcome', 'pending')
      .eq('request_status', 'open');
    const rows = ((data ?? []) as HelperPing[])
      .filter((p) => !p.expires_at || new Date(p.expires_at).getTime() > Date.now())
      .sort((a, b) => {
        // Personal asks from your connections come first.
        const dir = Number(!!b.directed_to_me) - Number(!!a.directed_to_me);
        if (dir !== 0) return dir;
        const ur = (URGENCY_RANK[a.urgency] ?? 9) - (URGENCY_RANK[b.urgency] ?? 9);
        if (ur !== 0) return ur;
        return (a.approx_distance_m ?? 1e9) - (b.approx_distance_m ?? 1e9);
      });
    setPings(rows);
    setLoading(false);
  }, []);

  // Show what's already there IMMEDIATELY — GPS can take many seconds on
  // Android, and the list must never wait for it (it looked broken before).
  // Location sync runs in parallel, best-effort, to keep us findable.
  useEffect(() => {
    load();
    (async () => {
      try {
        const granted = await requestLocationPermission();
        if (granted) {
          const c = await getCurrentCoords();
          await supabase.rpc('update_my_location', { p_lat: c.lat, p_lng: c.lng });
        }
      } catch {
        // best-effort
      }
    })();
  }, [load]);

  // Refresh whenever the screen regains focus (it used to load only on mount,
  // so pings that arrived while you were elsewhere never appeared).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Live: new pings for me arrive → refresh.
  useRealtime(
    session ? `my-pings-${session.user.id}` : null,
    [{ table: 'dispatch_targets', filter: `helper_id=eq.${session?.user.id}` }],
    load,
  );

  return (
    <Screen scroll={false} padded={false}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={26} color={colors.textPrimary} />
        </Pressable>
        <Text variant="heading" weight="bold" style={styles.topTitle}>
          People who need a hand
        </Text>
        <View style={{ width: 26 }} />
      </View>

      {loading && pings.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : pings.length === 0 ? (
        <EmptyState
          icon="heart-outline"
          title="No one needs help nearby right now"
          body="When someone near you asks for help in a category you chose, they'll appear here. You're all caught up."
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.accent} />
          }
        >
          {pings.map((p) => (
            <Pressable
              key={p.dispatch_id}
              onPress={() =>
                router.push({ pathname: '/help/[requestId]', params: { requestId: p.request_id } })
              }
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.surfaceEdge }]}
            >
              <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}>
                <Ionicons
                  name={(p.category_icon ?? 'ellipse-outline') as keyof typeof Ionicons.glyphMap}
                  size={24}
                  color={colors.accent}
                />
              </View>
              <View style={styles.cardBody}>
                <View style={styles.cardTop}>
                  <Text variant="body" weight="bold" style={{ flex: 1 }}>
                    {p.category_label}
                  </Text>
                  <View
                    style={[
                      styles.urgencyPill,
                      {
                        backgroundColor:
                          p.urgency === 'urgent' || p.urgency === 'sos'
                            ? colors.accent
                            : colors.accentSoft,
                      },
                    ]}
                  >
                    <Text
                      variant="small"
                      weight="bold"
                      tone={p.urgency === 'urgent' || p.urgency === 'sos' ? 'onAccent' : 'accent'}
                    >
                      {URGENCY_LABEL[p.urgency] ?? p.urgency}
                    </Text>
                  </View>
                </View>
                {p.directed_to_me ? (
                  <Text variant="small" weight="semibold" tone="accent">
                    {p.from_name ?? 'A connection'} asked you directly
                  </Text>
                ) : null}
                {p.description ? (
                  <Text variant="small" tone="secondary" numberOfLines={2}>
                    {p.description}
                  </Text>
                ) : null}
                <View style={styles.metaRow}>
                  {p.is_online ? <Meta icon="globe-outline" text="Online" /> : null}
                  {!p.is_online && p.approx_distance_m != null ? (
                    <Meta icon="location-outline" text={distanceLabel(p.approx_distance_m)} />
                  ) : null}
                  {!p.is_online && p.approx_area ? <Meta icon="map-outline" text={p.approx_area} /> : null}
                  <Meta icon="time-outline" text={timeAgo(p.pinged_at)} />
                </View>
              </View>
            </Pressable>
          ))}
          <Text variant="small" tone="faint" center style={styles.bottom}>
            That&apos;s everyone nearby — you&apos;re all caught up.
          </Text>
        </ScrollView>
      )}
    </Screen>
  );
}

function Meta({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.meta}>
      <Ionicons name={icon} size={14} color={colors.textFaint} />
      <Text variant="small" tone="faint">
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  topTitle: { flex: 1, textAlign: 'center' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.md },
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radii.xl,
    padding: spacing.lg,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1, gap: spacing.xs },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  urgencyPill: { borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: 3 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xs },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  bottom: { paddingTop: spacing.lg },
});
