import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { Button, Card, Screen, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

// The seeker's waiting screen (PRD 10.5): calm, reassuring, live — and honest.
// Never a dead spinner (PRD 3.10). Match/veto arrives in Chunk 3; expiry and
// cancel work now.

type RequestRow = {
  id: string;
  status: 'open' | 'matched' | 'active' | 'completed' | 'cancelled' | 'expired';
  timing: 'now' | 'scheduled';
  scheduled_at: string | null;
  urgency: string;
  description: string | null;
  approx_area: string | null;
  created_at: string;
  expires_at: string | null;
  category_id: string;
};

export default function RequestWaiting() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [request, setRequest] = useState<RequestRow | null>(null);
  const [categoryLabel, setCategoryLabel] = useState('');
  const [now, setNow] = useState(Date.now());
  const [cancelling, setCancelling] = useState(false);

  // Load + subscribe to my request row (RLS: seeker-owned).
  useEffect(() => {
    if (!id) return;
    let alive = true;

    (async () => {
      const { data } = await supabase
        .from('requests')
        .select(
          'id, status, timing, scheduled_at, urgency, description, approx_area, created_at, expires_at, category_id',
        )
        .eq('id', id)
        .single();
      if (!alive || !data) return;
      setRequest(data as RequestRow);
      const { data: cat } = await supabase
        .from('categories')
        .select('label')
        .eq('id', data.category_id)
        .single();
      if (alive && cat) setCategoryLabel(cat.label);
    })();

    const channel = supabase
      .channel(`request-${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'requests', filter: `id=eq.${id}` },
        (payload) => {
          setRequest((prev) => (prev ? { ...prev, ...(payload.new as RequestRow) } : prev));
        },
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [id]);

  // Tick every second for the countdown; flip to expired locally when passed.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  async function cancel() {
    if (!request) return;
    Alert.alert('Cancel this request?', 'Helpers will no longer be notified.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel request',
        style: 'destructive',
        onPress: async () => {
          setCancelling(true);
          const { error } = await supabase
            .from('requests')
            .update({ status: 'cancelled' })
            .eq('id', request.id);
          setCancelling(false);
          if (error) {
            Alert.alert('Could not cancel', 'Please try again.');
          } else {
            router.replace('/(main)');
          }
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
  const status = expiredLocally ? 'expired' : request.status;

  const remaining = expiresAt ? Math.max(0, expiresAt - now) : null;
  const remainingLabel =
    remaining !== null
      ? remaining >= 60 * 60 * 1000
        ? `${Math.floor(remaining / 3600000)}h ${Math.floor((remaining % 3600000) / 60000)}m`
        : `${Math.floor(remaining / 60000)}m ${Math.floor((remaining % 60000) / 1000)}s`
      : null;

  return (
    <Screen scroll={false}>
      <View style={styles.body}>
        <View style={styles.center}>
          {status === 'open' ? (
            <>
              <View style={[styles.pulseCircle, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="radio-outline" size={44} color={colors.accent} />
              </View>
              <Text variant="title" center>
                Finding someone nearby…
              </Text>
              <Text variant="body" tone="secondary" center style={styles.copy}>
                {request.timing === 'scheduled'
                  ? 'Your request is gathering hands for the scheduled time.'
                  : 'Nearby verified helpers are being notified, closest first.'}
              </Text>
            </>
          ) : null}

          {status === 'matched' || status === 'active' ? (
            <>
              <View style={[styles.pulseCircle, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="hand-left" size={44} color={colors.accent} />
              </View>
              <Text variant="title" center>
                Someone raised a hand!
              </Text>
              <Text variant="body" tone="secondary" center style={styles.copy}>
                The confirm step arrives in the next build phase.
              </Text>
            </>
          ) : null}

          {status === 'expired' ? (
            <>
              <View style={[styles.pulseCircle, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="moon-outline" size={44} color={colors.accent} />
              </View>
              <Text variant="title" center>
                No one&apos;s available right now
              </Text>
              <Text variant="body" tone="secondary" center style={styles.copy}>
                That happens sometimes — it is early days in your area. You can
                try again, or widen what you asked for.
              </Text>
            </>
          ) : null}

          {status === 'cancelled' ? (
            <>
              <Text variant="title" center>
                Request cancelled
              </Text>
            </>
          ) : null}

          <Card style={styles.detailCard}>
            <DetailRow icon="pricetag-outline" text={categoryLabel || '…'} />
            {request.description ? (
              <DetailRow icon="chatbox-ellipses-outline" text={request.description} />
            ) : null}
            {request.approx_area ? (
              <DetailRow icon="location-outline" text={`Near ${request.approx_area}`} />
            ) : null}
            {status === 'open' && remainingLabel ? (
              <DetailRow icon="hourglass-outline" text={`Stays open for ${remainingLabel}`} />
            ) : null}
          </Card>
        </View>

        <View style={styles.footer}>
          {status === 'open' ? (
            <Button label="Cancel request" variant="secondary" onPress={cancel} busy={cancelling} />
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  pulseCircle: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  copy: { maxWidth: 320 },
  detailCard: { alignSelf: 'stretch', marginTop: spacing.xl, gap: spacing.sm },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  footer: { paddingBottom: spacing.lg },
});
