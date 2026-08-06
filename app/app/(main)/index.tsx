import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { OngoingHelp } from '@/components/help/OngoingHelp';
import { NotificationBell } from '@/components/NotificationBell';
import { VerifyFlow } from '@/components/kyc/VerifyFlow';
import { Card, Screen, Text, Tile } from '@/components/ui';
import { useAuth } from '@/lib/auth/AuthProvider';
import { celestialInfo } from '@/lib/celestial';
import { recentHelpCount } from '@/lib/moments';
import { useProfile } from '@/lib/profile/ProfileProvider';
import { radius as radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

// The home screen (PRD 10.4): a calm greeting, a Celestial Journey glance in
// impact language, an activity glance, and the two big actions — which now
// route into the raise-help flow and the Help-now list (verification gated).
export default function Home() {
  const { colors } = useTheme();
  const { session } = useAuth();
  const { profile, refetch } = useProfile();
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [helpCount, setHelpCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      recentHelpCount().then(setHelpCount).catch(() => {});
    }, []),
  );

  const firstName =
    profile?.display_name?.trim() ||
    session?.user.email?.split('@')[0] ||
    'friend';
  const stage = celestialInfo(profile?.celestial_stage ?? 'new_moon');
  const uniqueHelps = profile?.unique_helps ?? 0;
  const verified = profile?.verified ?? false;

  // The disclosure gate (PRD 2.1 / 10.8): looking around is free, but asking
  // for or offering help requires verification first.
  function onAction(kind: 'need' | 'help') {
    if (!verified) {
      setVerifyOpen(true);
      return;
    }
    if (kind === 'need') {
      router.push('/request/new'); // the 3-tap raise-help flow
    } else {
      router.push('/help'); // the bounded Help-now list
    }
  }

  return (
    <Screen>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text variant="small" tone="secondary">
            Hello,
          </Text>
          <Text variant="title" numberOfLines={1}>
            {firstName}
          </Text>
        </View>
        <NotificationBell />
        <Pressable
          onPress={() => router.push('/sos')}
          style={[styles.sosBtn, { borderColor: colors.danger }]}
          accessibilityRole="button"
          accessibilityLabel="Emergency SOS"
          hitSlop={8}
        >
          <Ionicons name="alert" size={18} color={colors.danger} />
          <Text variant="label" weight="bold" style={{ color: colors.danger }}>
            SOS
          </Text>
        </Pressable>
      </View>

      {/* A way back into any in-progress request or help. */}
      <OngoingHelp />

      {/* Celestial Journey glance — the night surface, impact language. */}
      <Card tone="night" style={styles.journeyCard}>
        <View style={styles.journeyRow}>
          <View style={[styles.stageBadge, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
            <Ionicons name={stage.icon} size={26} color={colors.moonlightStrong} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="small" tone="moonlight">
              Your journey
            </Text>
            <Text variant="heading" weight="bold" style={{ color: colors.moonlightStrong }}>
              {stage.label}
            </Text>
          </View>
        </View>
        <Text variant="body" tone="moonlight">
          {uniqueHelps === 0
            ? "You've reached no neighbours yet — your first help lights the way."
            : `You've reached ${uniqueHelps} ${uniqueHelps === 1 ? 'neighbour' : 'neighbours'}.`}
        </Text>
      </Card>

      {/* Activity glance (aggregate; real counts arrive with the engine). */}
      <View style={styles.activityRow}>
        <Ionicons name="people-outline" size={18} color={colors.textSecondary} />
        <Text variant="small" tone="secondary">
          {helpCount === 0
            ? 'No helps near you yet this week'
            : `${helpCount} ${helpCount === 1 ? 'help' : 'helps'} near you this week`}
        </Text>
      </View>

      {/* The two big actions. */}
      <View style={styles.actions}>
        <Tile
          label="I need help"
          hint="Ask a verified neighbour nearby"
          icon="hand-left-outline"
          variant="filled"
          onPress={() => onAction('need')}
        />
        <Tile
          label="Help someone"
          hint="See who needs a hand"
          icon="heart-outline"
          onPress={() => onAction('help')}
        />
      </View>

      <VerifyFlow
        visible={verifyOpen}
        onClose={() => setVerifyOpen(false)}
        onVerified={async () => {
          setVerifyOpen(false);
          await refetch();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  sosBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1.5,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  journeyCard: { gap: spacing.lg },
  journeyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  stageBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  actions: { gap: spacing.lg },
});
