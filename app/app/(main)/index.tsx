import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { VerifyFlow } from '@/components/kyc/VerifyFlow';
import { Button, Card, Screen, Sheet, Text, Tile } from '@/components/ui';
import { useAuth } from '@/lib/auth/AuthProvider';
import { celestialInfo } from '@/lib/celestial';
import { useProfile } from '@/lib/profile/ProfileProvider';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

// The home screen (PRD 10.4): a calm greeting, a Celestial Journey glance in
// impact language, an activity glance, and the two big actions. The actions
// are placeholders in Phase 0 — the raise-help + dispatch flows arrive in
// Phase 2 — so tapping them opens a gentle "coming soon" sheet.
export default function Home() {
  const { colors } = useTheme();
  const { session } = useAuth();
  const { profile, refetch } = useProfile();
  const [sheet, setSheet] = useState<null | 'help'>(null);
  const [verifyOpen, setVerifyOpen] = useState(false);

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
      setSheet('help'); // helper side arrives in Chunk 3
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
      </View>

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
          No helps near you yet this week
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

      <Sheet visible={sheet !== null} onClose={() => setSheet(null)} title="Help someone">
        <Text variant="body" tone="secondary">
          This is where you’ll see nearby people who need a hand and offer to
          help.
        </Text>
        <Text variant="small" tone="faint">
          Coming in the next build phase.
        </Text>
        <Button label="Got it" onPress={() => setSheet(null)} />
      </Sheet>

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
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
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
