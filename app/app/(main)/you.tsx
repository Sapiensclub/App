import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button, Card, Screen, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth/AuthProvider';
import { celestialInfo } from '@/lib/celestial';
import { useProfile } from '@/lib/hooks/useProfile';
import { colors, spacing } from '@/theme/tokens';

// The "You" tab (PRD 10.11). Phase 0 shows the essentials that already exist:
// name/email, verification state, and the Celestial stage. The full profile
// (photo, three meters, Moneta, Ways I help, journey timeline) is assembled
// across Phases 1 & 3.
export default function You() {
  const { session, signOut } = useAuth();
  const { profile, loading } = useProfile();
  const [busy, setBusy] = useState(false);

  const name = profile?.display_name?.trim() || 'Your name';
  const stage = celestialInfo(profile?.celestial_stage ?? 'new_moon');
  const memberSince = profile?.member_since
    ? new Date(profile.member_since).toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      })
    : '';

  async function onSignOut() {
    setBusy(true);
    try {
      await signOut();
    } catch {
      Alert.alert('Could not sign out', 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={40} color={colors.spark} />
        </View>
        <Text variant="title" weight="extrabold" center>
          {name}
        </Text>
        <Text variant="body" tone="soft" center>
          {session?.user.email}
        </Text>
      </View>

      <Card style={styles.rowCard}>
        <Row
          icon={stage.icon}
          label="Celestial stage"
          value={stage.label}
        />
        <Divider />
        <Row
          icon={profile?.verified ? 'shield-checkmark' : 'shield-outline'}
          label="Verification"
          value={
            loading
              ? '…'
              : profile?.verified
                ? 'Verified'
                : 'Not verified yet'
          }
          valueTone={profile?.verified ? 'spark' : 'soft'}
        />
        {memberSince ? (
          <>
            <Divider />
            <Row icon="calendar-outline" label="Member since" value={memberSince} />
          </>
        ) : null}
      </Card>

      <Text variant="small" tone="faint" center style={styles.note}>
        Your full profile — photo, meters, and journey — arrives in a later
        build phase.
      </Text>

      <View style={styles.signOut}>
        <Button
          label="Sign out"
          variant="secondary"
          busy={busy}
          onPress={onSignOut}
        />
      </View>
    </Screen>
  );
}

function Row({
  icon,
  label,
  value,
  valueTone = 'ink',
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  valueTone?: 'ink' | 'soft' | 'spark';
}) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={20} color={colors.inkSoft} />
      <Text variant="body" style={{ flex: 1 }}>
        {label}
      </Text>
      <Text variant="body" weight="semibold" tone={valueTone}>
        {value}
      </Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.sparkSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  rowCard: { paddingVertical: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  divider: { height: 1, backgroundColor: colors.paperEdge },
  note: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  signOut: { paddingTop: spacing.xxl },
});
