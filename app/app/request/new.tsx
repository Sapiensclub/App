import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  View,
} from 'react-native';

import { Button, Card, Screen, Text, TextField } from '@/components/ui';
import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth/AuthProvider';
import {
  getCurrentCoords,
  requestLocationPermission,
  reverseGeocodeLocality,
} from '@/lib/location/locationProvider';
import { supabase } from '@/lib/supabase';
import { radius as radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

// The raise-help flow (PRD 10.5), stripped to three taps:
// tap "I need help" → pick a category → say what & when → send.

type Category = {
  id: string;
  label: string;
  icon: string | null;
  typical_urgency: 'casual' | 'everyday' | 'urgent' | 'sos';
  default_timing: 'now' | 'scheduled' | 'either';
  interaction_type: 'one_to_one' | 'group' | 'either';
};

const CAP_MIN = 2;
const CAP_MAX = 8;

type Urgency = 'casual' | 'everyday' | 'urgent';
type Timing = 'now' | 'scheduled';

// ONE timing question (owner decision, 2026-08): "When do you need help?" —
// urgency is DERIVED from the answer, never asked separately, so contradictory
// combos ("Now" + "Whenever") are impossible and it's one less decision.
//   right_now → timing now,       urgency urgent
//   today     → timing now,       urgency everyday
//   pick      → timing scheduled, urgency everyday (≤4h away) / casual (later)
type WhenMode = 'right_now' | 'today' | 'pick';

const WHEN_OPTIONS: { mode: WhenMode; label: string }[] = [
  { mode: 'right_now', label: 'Right now' },
  { mode: 'today', label: 'Today' },
  { mode: 'pick', label: 'Pick a time' },
];

function urgencyForSchedule(when: Date): Urgency {
  const hoursAway = (when.getTime() - Date.now()) / (60 * 60 * 1000);
  return hoursAway <= 4 ? 'everyday' : 'casual';
}

function buildSchedulePresets(): { label: string; when: Date }[] {
  const now = new Date();
  const in1h = new Date(now.getTime() + 60 * 60 * 1000);
  const in3h = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const tomorrow9 = new Date(now);
  tomorrow9.setDate(tomorrow9.getDate() + 1);
  tomorrow9.setHours(9, 0, 0, 0);
  const tomorrow18 = new Date(now);
  tomorrow18.setDate(tomorrow18.getDate() + 1);
  tomorrow18.setHours(18, 0, 0, 0);
  return [
    { label: 'In 1 hour', when: in1h },
    { label: 'In 3 hours', when: in3h },
    { label: 'Tomorrow 9 am', when: tomorrow9 },
    { label: 'Tomorrow 6 pm', when: tomorrow18 },
  ];
}

export default function NewRequest() {
  const { colors } = useTheme();
  const { session } = useAuth();
  // When arriving from a connection's profile ("Ask [name] for help"), the
  // request is DIRECTED at that one person first (PRD 5.5).
  const { directedTo, directedName } = useLocalSearchParams<{
    directedTo?: string;
    directedName?: string;
  }>();
  const isDirected = !!directedTo;

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<Category | null>(null);

  const [description, setDescription] = useState('');
  const [whenMode, setWhenMode] = useState<WhenMode>('today');
  // Presets are built ONCE per screen so the selected time stays stable
  // (rebuilding each render made the selection never "stick").
  const presets = useMemo(buildSchedulePresets, []);
  const [scheduledLabel, setScheduledLabel] = useState<string | null>(null);
  const scheduledAt = useMemo(
    () => presets.find((p) => p.label === scheduledLabel)?.when ?? null,
    [presets, scheduledLabel],
  );
  const [preferWomen, setPreferWomen] = useState(false);
  const [isGroup, setIsGroup] = useState(false);
  const [cap, setCap] = useState(4);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('categories')
        .select('id, label, icon, typical_urgency, default_timing, interaction_type')
        .eq('enabled', true)
        .order('label');
      setCategories((data ?? []) as Category[]);
      setLoading(false);
    })();
  }, []);

  function pickCategory(c: Category) {
    setCategory(c);
    // Pre-fill the single "when" control from the category's nature (PRD 10.5):
    // scheduled-by-default categories open the time picker; urgent ones say
    // "Right now"; everything else defaults to the calm middle, "Today".
    setWhenMode(
      c.default_timing === 'scheduled'
        ? 'pick'
        : c.typical_urgency === 'urgent' || c.typical_urgency === 'sos'
          ? 'right_now'
          : 'today',
    );
    setScheduledLabel(null);
    setIsGroup(c.interaction_type === 'group');
    setCap(4);
  }

  const groupAllowed =
    !isDirected && (category?.interaction_type === 'group' || category?.interaction_type === 'either');

  async function send() {
    if (!category || !session) return;
    if (whenMode === 'pick' && !scheduledAt) {
      Alert.alert('When?', 'Pick a time for your request.');
      return;
    }
    // Derive what the engine needs from the one answer (see WhenMode above).
    const timing: Timing = whenMode === 'pick' ? 'scheduled' : 'now';
    const urgency: Urgency =
      whenMode === 'right_now'
        ? 'urgent'
        : whenMode === 'today'
          ? 'everyday'
          : urgencyForSchedule(scheduledAt!);
    setSending(true);
    try {
      const granted = await requestLocationPermission();
      if (!granted) {
        Alert.alert(
          'Location needed',
          'Sapiens needs your location to find helpers near you. Allow location access in Settings.',
        );
        return;
      }
      const coords = await getCurrentCoords();
      const locality = await reverseGeocodeLocality(coords);

      const { data, error } = await supabase
        .from('requests')
        .insert({
          seeker_id: session.user.id,
          category_id: category.id,
          description: description.trim() || null,
          timing,
          scheduled_at: timing === 'scheduled' ? scheduledAt!.toISOString() : null,
          urgency,
          meetpoint_lat: coords.lat,
          meetpoint_lng: coords.lng,
          approx_area: locality,
          prefer_women: preferWomen,
          // A directed ask is always one-to-one (you're asking one person).
          interaction_type: isDirected ? 'one_to_one' : groupAllowed && isGroup ? 'group' : 'one_to_one',
          participant_cap: !isDirected && groupAllowed && isGroup ? cap : null,
          is_directed: isDirected,
          directed_to: isDirected ? directedTo : null,
        })
        .select('id')
        .single();
      if (error) throw error;

      track('request_raised', {
        category: category.label,
        urgency,
        timing,
        group: !isDirected && groupAllowed && isGroup,
        directed: isDirected,
      });
      router.replace({ pathname: '/request/[id]', params: { id: data.id as string } });
    } catch (e) {
      Alert.alert(
        'Could not send',
        e instanceof Error ? e.message : 'Please try again in a moment.',
      );
    } finally {
      setSending(false);
    }
  }

  // ── Step 1: pick a category ────────────────────────────────────────────────
  if (!category) {
    return (
      <Screen>
        <TopBar
          title={isDirected ? `Ask ${directedName || 'them'} for help` : 'What do you need?'}
          onBack={() => router.back()}
        />
        {isDirected ? (
          <View style={[styles.directedBanner, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="person" size={18} color={colors.accent} />
            <Text variant="small" tone="accent" weight="semibold" style={{ flex: 1 }}>
              {directedName || 'They'} will be asked first. Pick what you need.
            </Text>
          </View>
        ) : null}
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <View style={styles.grid}>
            {categories.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => pickCategory(c)}
                style={[
                  styles.gridTile,
                  { backgroundColor: colors.surface, borderColor: colors.surfaceEdge },
                ]}
                accessibilityRole="button"
              >
                <View style={[styles.gridIcon, { backgroundColor: colors.accentSoft }]}>
                  <Ionicons
                    name={(c.icon ?? 'ellipse-outline') as keyof typeof Ionicons.glyphMap}
                    size={26}
                    color={colors.accent}
                  />
                </View>
                <Text variant="label" weight="bold" center>
                  {c.label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </Screen>
    );
  }

  // ── Step 2: what & when → send ────────────────────────────────────────────
  return (
    <Screen>
      <TopBar title={category.label} onBack={() => setCategory(null)} />

      <View style={styles.form}>
        <TextField
          label="What do you need? (optional)"
          placeholder="e.g. A ride to the clinic on MG Road"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={2}
          maxLength={200}
          style={styles.descInput}
          editable={!sending}
        />

        <View style={styles.section}>
          <Text variant="label" weight="semibold" tone="secondary">
            When do you need help?
          </Text>
          <View style={styles.chipRow}>
            {WHEN_OPTIONS.map((o) => (
              <Chip
                key={o.mode}
                label={o.label}
                active={whenMode === o.mode}
                onPress={() => setWhenMode(o.mode)}
              />
            ))}
          </View>
          {whenMode === 'pick' ? (
            <View style={styles.chipWrap}>
              {presets.map((p) => (
                <Chip
                  key={p.label}
                  label={p.label}
                  active={scheduledLabel === p.label}
                  onPress={() => setScheduledLabel(p.label)}
                />
              ))}
            </View>
          ) : null}
        </View>

        {groupAllowed ? (
          <View style={styles.section}>
            <Text variant="label" weight="semibold" tone="secondary">
              Just you, or a group?
            </Text>
            <View style={styles.chipRow}>
              <Chip label="Just me" active={!isGroup} onPress={() => setIsGroup(false)} />
              <Chip label="A group" active={isGroup} onPress={() => setIsGroup(true)} />
            </View>
            {isGroup ? (
              <Card style={styles.capRow}>
                <View style={{ flex: 1 }}>
                  <Text variant="body" weight="semibold">
                    How many people?
                  </Text>
                  <Text variant="small" tone="secondary">
                    Up to {cap} can join.
                  </Text>
                </View>
                <View style={styles.stepper}>
                  <Pressable
                    onPress={() => setCap((n) => Math.max(CAP_MIN, n - 1))}
                    style={[styles.stepBtn, { borderColor: colors.surfaceEdge }]}
                    hitSlop={6}
                  >
                    <Ionicons name="remove" size={20} color={colors.textPrimary} />
                  </Pressable>
                  <Text variant="heading" weight="bold" style={styles.capText}>
                    {cap}
                  </Text>
                  <Pressable
                    onPress={() => setCap((n) => Math.min(CAP_MAX, n + 1))}
                    style={[styles.stepBtn, { borderColor: colors.surfaceEdge }]}
                    hitSlop={6}
                  >
                    <Ionicons name="add" size={20} color={colors.textPrimary} />
                  </Pressable>
                </View>
              </Card>
            ) : null}
          </View>
        ) : null}

        <Card style={styles.preferRow}>
          <View style={{ flex: 1 }}>
            <Text variant="body" weight="semibold">
              Prefer women helpers
            </Text>
            <Text variant="small" tone="secondary">
              We will ask women nearby first when possible.
            </Text>
          </View>
          <Switch
            value={preferWomen}
            onValueChange={setPreferWomen}
            trackColor={{ true: colors.accent, false: colors.surfaceEdge }}
          />
        </Card>

        <View style={styles.sendWrap}>
          <Button
            label={isDirected ? `Ask ${directedName || 'them'}` : 'Ask for help'}
            onPress={send}
            busy={sending}
          />
          <Text variant="small" tone="faint" center>
            {isDirected
              ? `${directedName || 'They'} will be asked first. If they're not around, your request opens to others nearby. They see your exact location only once they accept.`
              : 'Nearby verified helpers will be notified. They see your request and area — never your exact location until you confirm someone.'}
          </Text>
        </View>
      </View>
    </Screen>
  );
}

function TopBar({ title, onBack }: { title: string; onBack: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.topBar}>
      <Pressable onPress={onBack} hitSlop={12} accessibilityLabel="Back">
        <Ionicons name="arrow-back" size={26} color={colors.textPrimary} />
      </Pressable>
      <Text variant="heading" weight="bold" style={styles.topTitle}>
        {title}
      </Text>
      <View style={{ width: 26 }} />
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active ? colors.accent : colors.surface,
          borderColor: active ? colors.accent : colors.surfaceEdge,
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text variant="label" weight="bold" tone={active ? 'onAccent' : 'secondary'}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  topTitle: { flex: 1, textAlign: 'center' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  directedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  gridTile: {
    width: '47.5%',
    borderWidth: 1,
    borderRadius: radii.xl,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 120,
    justifyContent: 'center',
  },
  gridIcon: {
    width: 52,
    height: 52,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  form: { gap: spacing.xl, paddingBottom: spacing.xxl },
  descInput: { minHeight: 72, textAlignVertical: 'top' },
  section: { gap: spacing.sm },
  chipRow: { flexDirection: 'row', gap: spacing.sm },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  chip: {
    borderWidth: 1.5,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  preferRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  capRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xs },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  capText: { minWidth: 24, textAlign: 'center', fontVariant: ['tabular-nums'] },
  sendWrap: { gap: spacing.md, marginTop: spacing.sm },
});
