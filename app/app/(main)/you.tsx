import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { CelestialJourney } from '@/components/journey/CelestialJourney';
import { GoodnessGauge } from '@/components/journey/GoodnessGauge';
import { TrustStars } from '@/components/journey/TrustStars';
import { VerifyFlow } from '@/components/kyc/VerifyFlow';
import { EditableAvatar } from '@/components/profile/EditableAvatar';
import { EditProfile } from '@/components/profile/EditProfile';
import { HelperPreferences } from '@/components/profile/HelperPreferences';
import { TrustedContactsEditor } from '@/components/profile/TrustedContactsEditor';
import { Button, Card, Screen, Sheet, Text, TextField } from '@/components/ui';
import { useAuth } from '@/lib/auth/AuthProvider';
import { celestialInfo, journeyProgress, MILESTONES } from '@/lib/celestial';
import { loadMyConnections } from '@/lib/connections';
import { sendFeedback } from '@/lib/feedback';
import { useProfile } from '@/lib/profile/ProfileProvider';
import { supabase } from '@/lib/supabase';
import { radius as radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

// The "You" tab (PRD 10.11), assembled from what exists in Phase 1:
// photo + name + verified badge → impact numbers (in impact language, 9.3) →
// "Ways I help" glance → details → edit entries → sign out.
// The three meters' visuals and the private journey timeline arrive in
// Phase 3; connections in Phase 4.
export default function You() {
  const { colors } = useTheme();
  const { session, signOut } = useAuth();
  const { profile, loading, refetch } = useProfile();

  const [busy, setBusy] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [waysOpen, setWaysOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);

  const [waysLabels, setWaysLabels] = useState<string[]>([]);
  const [connectionCount, setConnectionCount] = useState(0);

  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [sendingFeedback, setSendingFeedback] = useState(false);

  const { width } = useWindowDimensions();
  const journeyWidth = Math.min(width - spacing.xl * 2 - spacing.xl * 2, 320);

  const uid = session?.user.id;
  const name = profile?.display_name?.trim() || 'Your name';
  const stage = celestialInfo(profile?.celestial_stage ?? 'new_moon');
  const verified = profile?.verified ?? false;
  const uniqueHelps = profile?.unique_helps ?? 0;
  const totalHelps = profile?.total_helps ?? 0;
  const journey = journeyProgress(uniqueHelps);
  const memberSince = profile?.member_since
    ? new Date(profile.member_since).toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      })
    : '';

  // "Ways I help" glance: selected category labels, refreshed after the
  // preferences modal closes.
  const loadWays = useCallback(async () => {
    if (!uid) return;
    const { data: prefs } = await supabase
      .from('helper_preferences')
      .select('categories')
      .eq('user_id', uid)
      .single();
    const ids = (prefs?.categories as string[] | null) ?? [];
    if (!ids.length) {
      setWaysLabels([]);
      return;
    }
    const { data: cats } = await supabase
      .from('categories')
      .select('id, label')
      .in('id', ids);
    setWaysLabels((cats ?? []).map((c) => c.label));
  }, [uid]);

  useEffect(() => {
    loadWays();
  }, [loadWays]);

  // Refresh profile counters + meters whenever the tab regains focus (e.g.
  // after completing a help).
  useFocusEffect(
    useCallback(() => {
      refetch();
      loadWays();
      loadMyConnections().then((c) => setConnectionCount(c.length));
    }, [refetch, loadWays]),
  );

  async function onSendFeedback() {
    if (!uid || !feedbackText.trim()) return;
    setSendingFeedback(true);
    try {
      await sendFeedback(uid, feedbackText);
      setFeedbackOpen(false);
      setFeedbackText('');
      Alert.alert('Thank you 🙏', 'Your note went straight to the team.');
    } catch {
      Alert.alert('Could not send', 'Please try again in a moment.');
    } finally {
      setSendingFeedback(false);
    }
  }

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
      {/* Identity */}
      <View style={styles.header}>
        {uid ? (
          <EditableAvatar
            userId={uid}
            photoUrl={profile?.display_photo_url ?? null}
            onChanged={refetch}
          />
        ) : null}
        <View style={styles.nameRow}>
          <Text variant="title" center>
            {name}
          </Text>
          {verified ? (
            <Ionicons name="shield-checkmark" size={22} color={colors.success} />
          ) : null}
        </View>
        <Text variant="small" tone="secondary" center>
          {session?.user.email}
        </Text>
        {profile?.bio?.trim() ? (
          <Text variant="body" tone="secondary" center style={styles.bio}>
            {profile.bio.trim()}
          </Text>
        ) : null}
      </View>

      {/* The Celestial Journey — the Spiritual meter (PRD 7.7/7.8) */}
      <Card tone="night" style={styles.journeyCard}>
        <CelestialJourney unique={uniqueHelps} width={journeyWidth} />
        <Text variant="title" celebrate center style={{ color: colors.moonlightStrong }}>
          {journey.label}
        </Text>
        <Text variant="body" tone="moonlight" center>
          {uniqueHelps === 0
            ? 'Your first help lights the way'
            : `You've reached ${uniqueHelps} ${uniqueHelps === 1 ? 'neighbour' : 'neighbours'}`}
        </Text>
        {journey.next != null ? (
          <>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(journey.fraction * 100)}%` }]} />
            </View>
            <Text variant="small" tone="moonlight" center>
              {journey.next - uniqueHelps} more to {journey.nextLabel}
            </Text>
          </>
        ) : (
          <Text variant="small" tone="moonlight" center>
            You&apos;ve joined the galaxy ✦
          </Text>
        )}
        {/* Milestone dots */}
        <View style={styles.milestoneRow}>
          {MILESTONES.map((m) => {
            const reached = uniqueHelps >= m;
            return (
              <View key={m} style={styles.milestone}>
                <View
                  style={[
                    styles.milestoneDot,
                    { backgroundColor: reached ? colors.gold : 'rgba(205,214,255,0.25)' },
                  ]}
                />
                <Text variant="small" style={{ color: reached ? colors.gold : colors.moonlight, opacity: reached ? 1 : 0.6 }}>
                  {m}
                </Text>
              </View>
            );
          })}
        </View>
      </Card>

      {/* Trust + Goodness meters */}
      <View style={styles.metersRow}>
        <Card style={styles.meterCard}>
          <Text variant="small" tone="secondary" center>
            Trust
          </Text>
          <TrustStars avg={profile?.trust_rating_avg ?? null} />
        </Card>
        <Card style={styles.meterCard}>
          <Text variant="small" tone="secondary" center>
            Goodness
          </Text>
          <GoodnessGauge score={profile?.goodness_score ?? 0} />
        </Card>
      </View>

      {/* Impact numbers — framing over raw counts (PRD 9.3) */}
      <Card style={styles.rowCard}>
        <View style={styles.statsRow}>
          <Stat value={uniqueHelps} label="Neighbours" />
          <StatDivider />
          <Stat value={totalHelps} label="Total helps" />
          <StatDivider />
          <Stat value={profile?.moneta_lifetime ?? 0} label="Moneta" />
        </View>
      </Card>

      {/* Connections + leaderboard */}
      <Card style={[styles.rowCard, styles.linksCard]}>
        <LinkRow
          icon="people-outline"
          label={connectionCount > 0 ? `Connections · ${connectionCount}` : 'Connections'}
          onPress={() => router.push('/connections')}
        />
        <Divider />
        <LinkRow
          icon="trophy-outline"
          label="This month's leaderboard"
          onPress={() => router.push('/leaderboard')}
        />
      </Card>

      {/* Ways I help glance */}
      <Pressable onPress={() => setWaysOpen(true)}>
        <Card style={styles.waysCard}>
          <View style={styles.waysHeader}>
            <Text variant="heading" weight="bold" style={{ flex: 1 }}>
              Ways I help
            </Text>
            <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
          </View>
          {waysLabels.length ? (
            <View style={styles.waysChips}>
              {waysLabels.map((label) => (
                <View
                  key={label}
                  style={[
                    styles.waysChip,
                    { backgroundColor: colors.accentSoft, borderColor: colors.accent },
                  ]}
                >
                  <Text variant="small" weight="semibold" tone="accent">
                    {label}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text variant="small" tone="secondary">
              Pick what you are happy to help with — you will only be pinged for
              those.
            </Text>
          )}
        </Card>
      </Pressable>

      {/* Details */}
      <Card style={styles.rowCard}>
        <Row icon={stage.icon} label="Celestial stage" value={stage.label} />
        <Divider />
        <Row
          icon={verified ? 'shield-checkmark' : 'shield-outline'}
          label="Verification"
          value={loading ? '…' : verified ? 'Verified' : 'Not verified yet'}
          valueTone={verified ? 'accent' : 'secondary'}
        />
        {memberSince ? (
          <>
            <Divider />
            <Row icon="calendar-outline" label="Member since" value={memberSince} />
          </>
        ) : null}
      </Card>

      {/* Edit entries */}
      <Card style={[styles.rowCard, styles.linksCard]}>
        <LinkRow icon="create-outline" label="Edit profile" onPress={() => setEditOpen(true)} />
        <Divider />
        <LinkRow
          icon="people-outline"
          label="Trusted contacts"
          onPress={() => setContactsOpen(true)}
        />
        <Divider />
        <LinkRow
          icon="options-outline"
          label="Ways I help & preferences"
          onPress={() => setWaysOpen(true)}
        />
        <Divider />
        <LinkRow
          icon="chatbubble-ellipses-outline"
          label="Send feedback"
          onPress={() => setFeedbackOpen(true)}
        />
      </Card>

      {!loading && !verified ? (
        <View style={styles.verifyCta}>
          <Button label="Verify now" onPress={() => setVerifyOpen(true)} />
          <Text variant="small" tone="faint" center>
            Verify to ask for or offer help.
          </Text>
        </View>
      ) : null}

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

      <HelperPreferences
        visible={waysOpen}
        onClose={() => {
          setWaysOpen(false);
          loadWays();
        }}
      />

      <EditProfile visible={editOpen} onClose={() => setEditOpen(false)} />

      <TrustedContactsEditor
        visible={contactsOpen}
        onClose={() => setContactsOpen(false)}
      />

      <Sheet visible={feedbackOpen} onClose={() => setFeedbackOpen(false)} title="Send feedback">
        <Text variant="body" tone="secondary">
          Found something confusing or broken? Tell us plainly — it goes
          straight to the team.
        </Text>
        <TextField
          label="What happened?"
          placeholder="e.g. The waiting screen got stuck after I cancelled"
          value={feedbackText}
          onChangeText={setFeedbackText}
          multiline
          editable={!sendingFeedback}
          style={styles.feedbackInput}
        />
        <Button
          label="Send"
          onPress={onSendFeedback}
          busy={sendingFeedback}
          disabled={!feedbackText.trim()}
        />
      </Sheet>
    </Screen>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text variant="title" weight="extrabold" tone="accent" style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
      <Text variant="small" tone="secondary" center>
        {label}
      </Text>
    </View>
  );
}

function StatDivider() {
  const { colors } = useTheme();
  return <View style={[styles.statDivider, { backgroundColor: colors.surfaceEdge }]} />;
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

function LinkRow({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <View style={styles.row}>
        <Ionicons name={icon} size={20} color={colors.textSecondary} />
        <Text variant="body" style={{ flex: 1 }}>
          {label}
        </Text>
        <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
      </View>
    </Pressable>
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
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  bio: { maxWidth: 320, marginTop: spacing.xs },
  journeyCard: { alignItems: 'center', gap: spacing.sm },
  progressTrack: {
    alignSelf: 'stretch',
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(205,214,255,0.2)',
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: '#F0C078' },
  milestoneRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    marginTop: spacing.md,
  },
  milestone: { alignItems: 'center', gap: 4 },
  milestoneDot: { width: 8, height: 8, borderRadius: 4 },
  metersRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  meterCard: { flex: 1, alignItems: 'center', gap: spacing.sm, justifyContent: 'flex-start' },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingVertical: spacing.sm,
  },
  stat: { flex: 1, alignItems: 'center', gap: spacing.xs },
  statDivider: { width: 1, marginVertical: spacing.xs },
  waysCard: { marginTop: spacing.lg, gap: spacing.sm },
  waysHeader: { flexDirection: 'row', alignItems: 'center' },
  waysChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  waysChip: {
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  rowCard: { paddingVertical: spacing.sm, marginTop: spacing.lg },
  linksCard: {},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  divider: { height: 1 },
  verifyCta: { paddingTop: spacing.xl, gap: spacing.sm },
  note: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  signOut: { paddingTop: spacing.lg, paddingBottom: spacing.xl },
  feedbackInput: { minHeight: 96, textAlignVertical: 'top' },
});
