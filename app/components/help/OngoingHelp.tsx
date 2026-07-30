import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { useAuth } from '@/lib/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { radius as radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

type SeekerReq = { id: string; status: string };
type HelperMatch = { request_id: string; status: string };

// The "ongoing help" surface: a way back into an in-progress request (as
// seeker) or match (as helper), so leaving a screen never loses the thread.
export function OngoingHelp() {
  const { colors } = useTheme();
  const { session } = useAuth();
  const uid = session?.user.id;
  const [seekerReq, setSeekerReq] = useState<SeekerReq | null>(null);
  const [helperMatch, setHelperMatch] = useState<HelperMatch | null>(null);

  const load = useCallback(async () => {
    if (!uid) return;
    const [{ data: reqs }, { data: matches }] = await Promise.all([
      supabase
        .from('requests')
        .select('id, status')
        .eq('seeker_id', uid)
        .in('status', ['open', 'matched', 'active'])
        .order('created_at', { ascending: false })
        .limit(1),
      supabase
        .from('matches')
        .select('request_id, status')
        .eq('helper_id', uid)
        .in('status', ['confirmed', 'on_the_way', 'arrived'])
        .order('confirmed_at', { ascending: false })
        .limit(1),
    ]);
    setSeekerReq((reqs?.[0] as SeekerReq) ?? null);
    setHelperMatch((matches?.[0] as HelperMatch) ?? null);
  }, [uid]);

  // Refresh whenever Home regains focus (e.g. returning from a match screen).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // And live, so a match forming while you sit on Home shows up.
  useEffect(() => {
    if (!uid) return;
    const channel = supabase
      .channel('ongoing-help')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests', filter: `seeker_id=eq.${uid}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `helper_id=eq.${uid}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [uid, load]);

  if (!seekerReq && !helperMatch) return null;

  const seekerText =
    seekerReq?.status === 'open'
      ? { title: 'Finding help nearby', sub: 'Tap to see status', icon: 'radio-outline' as const }
      : { title: 'Your helper is on the way', sub: 'Tap to view details', icon: 'walk-outline' as const };

  return (
    <View style={styles.wrap}>
      {helperMatch ? (
        <Card
          icon="hand-left"
          title="You're helping someone"
          sub="Tap to continue"
          onPress={() =>
            router.push({ pathname: '/help/[requestId]', params: { requestId: helperMatch.request_id } })
          }
          colors={colors}
          filled
        />
      ) : null}
      {seekerReq ? (
        <Card
          icon={seekerText.icon}
          title={seekerText.title}
          sub={seekerText.sub}
          onPress={() => router.push({ pathname: '/request/[id]', params: { id: seekerReq.id } })}
          colors={colors}
        />
      ) : null}
    </View>
  );
}

function Card({
  icon,
  title,
  sub,
  onPress,
  colors,
  filled = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  sub: string;
  onPress: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
  filled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.card,
        filled
          ? { backgroundColor: colors.accent }
          : { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.accent },
      ]}
      accessibilityRole="button"
    >
      <View
        style={[
          styles.iconWrap,
          { backgroundColor: filled ? 'rgba(20,20,20,0.14)' : colors.accentSoft },
        ]}
      >
        <Ionicons name={icon} size={22} color={filled ? colors.onAccent : colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="body" weight="bold" tone={filled ? 'onAccent' : 'primary'}>
          {title}
        </Text>
        <Text variant="small" tone={filled ? 'onAccent' : 'secondary'}>
          {sub}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={filled ? colors.onAccent : colors.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md, marginBottom: spacing.lg },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.xl,
    padding: spacing.lg,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
