import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Screen, Sheet, Text, Tile } from '@/components/ui';
import { useAuth } from '@/lib/auth/AuthProvider';
import { celestialInfo } from '@/lib/celestial';
import { useProfile } from '@/lib/hooks/useProfile';
import { colors, spacing } from '@/theme/tokens';

// The home screen (PRD 10.4): a calm greeting, a Celestial Journey glance in
// impact language, an activity glance, and the two big actions. The actions
// are placeholders in Phase 0 — the raise-help + dispatch flows arrive in
// Phase 2 — so tapping them opens a gentle "coming soon" sheet.
export default function Home() {
  const { session } = useAuth();
  const { profile } = useProfile();
  const [sheet, setSheet] = useState<null | 'need' | 'help'>(null);

  const firstName =
    profile?.display_name?.trim() ||
    session?.user.email?.split('@')[0] ||
    'friend';
  const stage = celestialInfo(profile?.celestial_stage ?? 'new_moon');
  const uniqueHelps = profile?.unique_helps ?? 0;

  return (
    <Screen>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text variant="small" tone="soft">
            Hello,
          </Text>
          <Text variant="title" weight="extrabold" numberOfLines={1}>
            {firstName}
          </Text>
        </View>
      </View>

      {/* Celestial Journey glance — the night surface, impact language. */}
      <Card tone="night" style={styles.journeyCard}>
        <View style={styles.journeyRow}>
          <View style={styles.stageBadge}>
            <Ionicons name={stage.icon} size={26} color={colors.paper} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="small" style={{ color: colors.paperEdge }}>
              Your journey
            </Text>
            <Text variant="heading" weight="bold" style={{ color: colors.cloud }}>
              {stage.label}
            </Text>
          </View>
        </View>
        <Text variant="body" style={{ color: colors.paperEdge }}>
          {uniqueHelps === 0
            ? "You've reached no neighbours yet — your first help lights the way."
            : `You've reached ${uniqueHelps} ${uniqueHelps === 1 ? 'neighbour' : 'neighbours'}.`}
        </Text>
      </Card>

      {/* Activity glance (aggregate; real counts arrive with the engine). */}
      <View style={styles.activityRow}>
        <Ionicons name="people-outline" size={18} color={colors.inkSoft} />
        <Text variant="small" tone="soft">
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
          onPress={() => setSheet('need')}
        />
        <Tile
          label="Help someone"
          hint="See who needs a hand"
          icon="heart-outline"
          onPress={() => setSheet('help')}
        />
      </View>

      <Sheet
        visible={sheet !== null}
        onClose={() => setSheet(null)}
        title={sheet === 'need' ? 'Ask for help' : 'Help someone'}
      >
        <Text variant="body" tone="soft">
          {sheet === 'need'
            ? 'This is where you’ll raise a request in three taps — pick what you need, say when, and nearby verified helpers get pinged.'
            : 'This is where you’ll see nearby people who need a hand and offer to help.'}
        </Text>
        <Text variant="small" tone="faint">
          Coming in the next build phase.
        </Text>
        <Button label="Got it" onPress={() => setSheet(null)} />
      </Sheet>
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
    backgroundColor: 'rgba(255,255,255,0.14)',
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
