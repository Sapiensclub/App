import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { Button, Card, Screen, Text } from '@/components/ui';
import { celestialInfo } from '@/lib/celestial';
import {
  confirmHelper,
  loadMatchForRequest,
  vetoHelper,
  type Candidate,
  type MatchDetails,
} from '@/lib/help/matching';
import { distanceLabel } from '@/lib/location/locationProvider';
import { useRealtime } from '@/lib/realtime';
import { supabase } from '@/lib/supabase';
import { radius as radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

type RequestRow = {
  id: string;
  status: 'open' | 'matched' | 'active' | 'completed' | 'cancelled' | 'expired';
  timing: 'now' | 'scheduled';
  urgency: string;
  description: string | null;
  approx_area: string | null;
  expires_at: string | null;
  category_id: string;
};

export default function RequestWaiting() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [request, setRequest] = useState<RequestRow | null>(null);
  const [categoryLabel, setCategoryLabel] = useState('');
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [match, setMatch] = useState<MatchDetails | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const { data: reqRow } = await supabase
      .from('requests')
      .select('id, status, timing, urgency, description, approx_area, expires_at, category_id')
      .eq('id', id)
      .single();
    if (reqRow) {
      setRequest(reqRow as RequestRow);
      if (!categoryLabel) {
        const { data: cat } = await supabase
          .from('categories')
          .select('label')
          .eq('id', reqRow.category_id)
          .single();
        if (cat) setCategoryLabel(cat.label);
      }
    }

    const m = await loadMatchForRequest(id);
    setMatch(m);

    // earliest raised hand is the current candidate (veto, not pick).
    const { data: cands } = await supabase
      .from('request_candidates')
      .select('*')
      .eq('request_id', id)
      .order('raised_at');
    setCandidate(((cands ?? []) as Candidate[])[0] ?? null);
  }, [id, categoryLabel]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtime(
    id ? `request-${id}` : null,
    [
      { table: 'requests', filter: `id=eq.${id}` },
      { table: 'request_responses', filter: `request_id=eq.${id}` },
      { table: 'matches', filter: `request_id=eq.${id}` },
    ],
    load,
  );

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  async function onConfirm() {
    if (!candidate || !id) return;
    setBusy(true);
    try {
      await confirmHelper(id, candidate.helper_id);
      await load();
    } catch (e) {
      Alert.alert('Could not confirm', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function onDecline() {
    if (!candidate || !id) return;
    setBusy(true);
    try {
      await vetoHelper(id, candidate.helper_id);
      await load();
    } catch {
      Alert.alert('Could not decline', 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!request) return;
    Alert.alert('Cancel this request?', 'Helpers will no longer be notified.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel request',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          const { error } = await supabase.from('requests').update({ status: 'cancelled' }).eq('id', request.id);
          setBusy(false);
          if (error) Alert.alert('Could not cancel', 'Please try again.');
          else router.replace('/(main)');
        },
      },
    ]);
  }

  if (!request) {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

  const expiresAt = request.expires_at ? new Date(request.expires_at).getTime() : null;
  const expiredLocally = expiresAt !== null && now > expiresAt && request.status === 'open';
  const isMatched = !!match && match.status !== 'cancelled';
  const status = isMatched ? 'matched' : expiredLocally ? 'expired' : request.status;

  // ── Matched: the helper is coming ─────────────────────────────────────────
  if (status === 'matched' && match) {
    const stage = celestialInfo(match.other_stage);
    return (
      <Screen>
        <View style={styles.matchedHeader}>
          {match.other_photo ? (
            <Image source={{ uri: match.other_photo }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name="person" size={36} color={colors.accent} />
            </View>
          )}
          <Text variant="title" center style={{ marginTop: spacing.md }}>
            {match.other_name ?? 'Your helper'} is coming
          </Text>
          <View style={styles.stageRow}>
            <Ionicons name={stage.icon} size={16} color={colors.textSecondary} />
            <Text variant="small" tone="secondary">
              {stage.label}
              {match.other_trust != null ? ` · ${match.other_trust.toFixed(1)}★` : ''}
            </Text>
          </View>
        </View>

        <Card style={styles.meetCard}>
          <Text variant="small" tone="secondary">
            Meetup code
          </Text>
          <Text variant="display" celebrate style={styles.code}>
            {match.meetup_code}
          </Text>
          <Text variant="small" tone="faint">
            Ask for this code when they arrive, to confirm it&apos;s the right person.
          </Text>
        </Card>

        <Text variant="small" tone="faint" center style={styles.note}>
          Live arrival status and completion arrive in the next build step.
        </Text>

        <View style={styles.footer}>
          <Button
            label={`Message ${match.other_name ?? 'helper'}`}
            left={<Ionicons name="chatbubble-ellipses" size={18} color={colors.onAccent} />}
            onPress={() => router.push({ pathname: '/chat/[requestId]', params: { requestId: id! } })}
          />
          <Button label="Back to home" variant="secondary" onPress={() => router.replace('/(main)')} />
        </View>
      </Screen>
    );
  }

  // ── A hand is raised: confirm or decline (veto, not pick) ─────────────────
  if (status === 'open' && candidate) {
    const stage = celestialInfo(candidate.celestial_stage);
    return (
      <Screen>
        <View style={styles.body}>
          <Text variant="title" center style={styles.raisedTitle}>
            Someone can help!
          </Text>
          <Card style={styles.candidateCard}>
            {candidate.display_photo_url ? (
              <Image source={{ uri: candidate.display_photo_url }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="person" size={36} color={colors.accent} />
              </View>
            )}
            <Text variant="heading" weight="bold" center style={{ marginTop: spacing.md }}>
              {candidate.display_name ?? 'A verified neighbour'}
            </Text>
            <View style={styles.stageRow}>
              <Ionicons name={stage.icon} size={16} color={colors.textSecondary} />
              <Text variant="small" tone="secondary">
                {stage.label}
                {candidate.trust_rating_avg != null ? ` · ${candidate.trust_rating_avg.toFixed(1)}★` : ' · new here'}
              </Text>
            </View>
            {candidate.approx_distance_m != null ? (
              <Text variant="small" tone="secondary" style={{ marginTop: spacing.xs }}>
                About {distanceLabel(candidate.approx_distance_m)} away
              </Text>
            ) : null}
          </Card>
          <Text variant="small" tone="faint" center style={styles.privacyNote}>
            Confirm to share your exact location and open a chat. Decline to wait
            for someone else — they won&apos;t be told.
          </Text>
        </View>
        <View style={styles.footer}>
          <Button label="Confirm" onPress={onConfirm} busy={busy} />
          <Button label="Decline" variant="secondary" onPress={onDecline} disabled={busy} />
        </View>
      </Screen>
    );
  }

  // ── Searching / expired / cancelled ───────────────────────────────────────
  return (
    <Screen scroll={false}>
      <View style={styles.body}>
        <View style={styles.center}>
          {status === 'open' ? (
            <>
              <View style={[styles.bigIcon, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="radio-outline" size={44} color={colors.accent} />
              </View>
              <Text variant="title" center>
                Finding someone nearby…
              </Text>
              <Text variant="body" tone="secondary" center style={styles.copy}>
                Nearby verified helpers are being notified, closest first. Hang
                tight — we&apos;ll tell you the moment someone raises a hand.
              </Text>
            </>
          ) : null}

          {status === 'expired' ? (
            <>
              <View style={[styles.bigIcon, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="moon-outline" size={44} color={colors.accent} />
              </View>
              <Text variant="title" center>
                No one&apos;s available right now
              </Text>
              <Text variant="body" tone="secondary" center style={styles.copy}>
                That happens sometimes — it&apos;s early days in your area. You can
                try again, or widen what you asked for.
              </Text>
            </>
          ) : null}

          {status === 'cancelled' ? (
            <Text variant="title" center>
              Request cancelled
            </Text>
          ) : null}

          <Card style={styles.detailCard}>
            <DetailRow icon="pricetag-outline" text={categoryLabel || '…'} />
            {request.description ? <DetailRow icon="chatbox-ellipses-outline" text={request.description} /> : null}
            {request.approx_area ? <DetailRow icon="location-outline" text={`Near ${request.approx_area}`} /> : null}
          </Card>
        </View>

        <View style={styles.footer}>
          {status === 'open' ? (
            <Button label="Cancel request" variant="secondary" onPress={cancel} busy={busy} />
          ) : (
            <Button label="Back to home" onPress={() => router.replace('/(main)')} />
          )}
        </View>
      </View>
    </Screen>
  );
}

function DetailRow({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon} size={18} color={colors.textSecondary} />
      <Text variant="body" tone="secondary" style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  copy: { maxWidth: 320 },
  bigIcon: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  detailCard: { alignSelf: 'stretch', marginTop: spacing.xl, gap: spacing.sm },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  footer: { gap: spacing.md, paddingBottom: spacing.lg },
  raisedTitle: { paddingTop: spacing.xl },
  candidateCard: { alignItems: 'center', marginTop: spacing.xl },
  privacyNote: { paddingTop: spacing.lg, paddingHorizontal: spacing.lg },
  matchedHeader: { alignItems: 'center', paddingTop: spacing.xxl },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  meetCard: { alignItems: 'center', gap: spacing.xs, marginTop: spacing.xxl },
  code: { letterSpacing: 8, marginVertical: spacing.xs },
  note: { paddingTop: spacing.xl },
});
