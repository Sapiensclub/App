import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { VerifyFlow } from '@/components/kyc/VerifyFlow';
import { Button, Card, Screen, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth/AuthProvider';
import { celestialInfo } from '@/lib/celestial';
import { useProfile } from '@/lib/profile/ProfileProvider';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

// The "You" tab (PRD 10.11). Phase 0 shows the essentials that already exist:
// name/email, verification state, and the Celestial stage. The full profile
// (photo, three meters, Moneta, Ways I help, journey timeline) is assembled
// across Phases 1 & 3.
export default function You() {
  const { colors } = useTheme();
  const { session, signOut } = useAuth();
  const { profile, loading, refetch } = useProfile();
  const [busy, setBusy] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);

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
        <View style={[styles.avatar, { backgroundColor: colors.accentSoft }]}>
          <Ionicons name="person" size={40} color={colors.accent} />
        </View>
        <Text variant="title" center>
          {name}
        </Text>
        <Text variant="body" tone="secondary" center>
          {session?.user.email}
        </Text>
      </View>

      <Card style={styles.rowCard}>
        <Row icon={stage.icon} label="Celestial stage" value={stage.label} />
        <Divider />
        <Row
          icon={profile?.verified ? 'shield-checkmark' : 'shield-outline'}
          label="Verification"
          value={loading ? '…' : profile?.verified ? 'Verified' : 'Not verified yet'}
          valueTone={profile?.verified ? 'accent' : 'secondary'}
        />
        {memberSince ? (
          <>
            <Divider />
            <Row icon="calendar-outline" label="Member since" value={memberSince} />
          </>
        ) : null}
      </Card>

      {!loading && !profile?.verified ? (
        <View style={styles.verifyCta}>
          <Button label="Verify now" onPress={() => setVerifyOpen(true)} />
          <Text variant="small" tone="faint" center>
            Verify to ask for or offer help.
          </Text>
        </View>
      ) : null}

      <Text variant="small" tone="faint" center style={styles.note}>
        Your full profile — photo, meters, and journey — arrives in a later
        build phase.
      </Text>

      <View style={styles.signOut}>
        <Button label="Sign out" variant="secondary" busy={busy} onPress={onSignOut} />
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

function Row({
  icon,
  label,
  value,
  valueTone = 'primary',
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  valueTone?: 'primary' | 'secondary' | 'accent';
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={20} color={colors.textSecondary} />
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
  const { colors } = useTheme();
  return <View style={[styles.divider, { backgroundColor: colors.surfaceEdge }]} />;
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
  divider: { height: 1 },
  verifyCta: { paddingTop: spacing.xl, gap: spacing.sm },
  note: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  signOut: { paddingTop: spacing.xxl },
});
