import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Text, TextField } from '@/components/ui';
import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { radius as radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

type Category = { id: string; slug: string; label: string; icon: string | null };
type QuietHours = {
  enabled: boolean;
  start: number;
  end: number;
  /** Minutes east of UTC (IST = 330) — lets the server check quiet hours in
   *  the member's LOCAL time, not server UTC. */
  tz?: number;
};

const RADIUS_MIN = 1000;
const RADIUS_MAX = 10000;
const RADIUS_STEP = 500;

function kmLabel(m: number): string {
  const km = m / 1000;
  return `${Number.isInteger(km) ? km : km.toFixed(1)} km`;
}

const DEFAULT_QUIET: QuietHours = { enabled: false, start: 22, end: 7 };

type Props = { visible: boolean; onClose: () => void };

/**
 * "Ways I help" + reach + quiet hours (PRD 9.6 / 3.1) and the missing-category
 * suggestion box. Availability is implicit — there is no online/offline toggle;
 * only quiet hours and (later) snooze narrow reach.
 */
export function HelperPreferences({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const { session } = useAuth();
  const uid = session?.user.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [radiusM, setRadiusM] = useState(3000);
  const [quiet, setQuiet] = useState<QuietHours>(DEFAULT_QUIET);

  const [suggestion, setSuggestion] = useState('');
  const [suggesting, setSuggesting] = useState(false);

  useEffect(() => {
    if (!visible || !uid) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const [cats, prefs] = await Promise.all([
        supabase.from('categories').select('id, slug, label, icon').eq('enabled', true),
        supabase
          .from('helper_preferences')
          .select('categories, radius_max_m, quiet_hours')
          .eq('user_id', uid)
          .single(),
      ]);
      if (!alive) return;
      if (cats.data) setCategories(cats.data as Category[]);
      if (prefs.data) {
        setSelected(new Set((prefs.data.categories as string[]) ?? []));
        setRadiusM(prefs.data.radius_max_m ?? 3000);
        setQuiet((prefs.data.quiet_hours as QuietHours) ?? DEFAULT_QUIET);
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [visible, uid]);

  function toggleCategory(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function shiftHour(field: 'start' | 'end', delta: number) {
    setQuiet((q) => ({ ...q, [field]: (q[field] + delta + 24) % 24 }));
  }

  async function save() {
    if (!uid) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('helper_preferences')
        .update({
          categories: Array.from(selected),
          radius_max_m: radiusM,
          // JS getTimezoneOffset is minutes WEST of UTC → negate (IST = 330).
          quiet_hours: { ...quiet, tz: -new Date().getTimezoneOffset() },
        })
        .eq('user_id', uid);
      if (error) throw error;
      track('helper_preferences_saved', { categories: selected.size });
      onClose();
    } catch {
      Alert.alert('Could not save', 'Please try again in a moment.');
    } finally {
      setSaving(false);
    }
  }

  async function submitSuggestion() {
    const text = suggestion.trim();
    if (!text || !uid) return;
    setSuggesting(true);
    try {
      const { error } = await supabase
        .from('category_suggestions')
        .insert({ user_id: uid, text });
      if (error) throw error;
      track('category_suggested');
      setSuggestion('');
      Alert.alert('Thank you', 'We will review your suggestion.');
    } catch {
      Alert.alert('Could not send', 'Please try again in a moment.');
    } finally {
      setSuggesting(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
        <View style={styles.topBar}>
          <Text variant="heading" weight="bold">
            Ways I help
          </Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
            <Ionicons name="close" size={28} color={colors.textSecondary} />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <Text variant="body" tone="secondary">
              Pick what you are happy to help with. You will only ever be pinged
              for these.
            </Text>

            <View style={styles.chips}>
              {categories.map((c) => {
                const on = selected.has(c.id);
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => toggleCategory(c.id)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: on ? colors.accentSoft : colors.surface,
                        borderColor: on ? colors.accent : colors.surfaceEdge,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Ionicons
                      name={(c.icon ?? 'ellipse-outline') as keyof typeof Ionicons.glyphMap}
                      size={20}
                      color={on ? colors.accent : colors.textSecondary}
                    />
                    <Text variant="label" weight="semibold" tone={on ? 'accent' : 'secondary'}>
                      {c.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.section}>
              <View style={styles.reachHeader}>
                <Text variant="heading" weight="bold" style={{ flex: 1 }}>
                  Your reach
                </Text>
                <Text variant="heading" weight="bold" tone="accent">
                  {kmLabel(radiusM)}
                </Text>
              </View>
              <Text variant="small" tone="secondary">
                The farthest we will ask you to travel. It can widen for urgent
                requests.
              </Text>
              <Slider
                style={styles.slider}
                minimumValue={RADIUS_MIN}
                maximumValue={RADIUS_MAX}
                step={RADIUS_STEP}
                value={radiusM}
                onValueChange={(v) => setRadiusM(Math.round(v))}
                minimumTrackTintColor={colors.accent}
                maximumTrackTintColor={colors.surfaceEdge}
                thumbTintColor={colors.accent}
              />
              <View style={styles.sliderEnds}>
                <Text variant="small" tone="faint">
                  1 km
                </Text>
                <Text variant="small" tone="faint">
                  10 km
                </Text>
              </View>
            </View>

            <Card style={styles.section}>
              <View style={styles.quietHeader}>
                <View style={{ flex: 1 }}>
                  <Text variant="heading" weight="bold">
                    Quiet hours
                  </Text>
                  <Text variant="small" tone="secondary">
                    No help requests during these hours.
                  </Text>
                </View>
                <Switch
                  value={quiet.enabled}
                  onValueChange={(v) => setQuiet((q) => ({ ...q, enabled: v }))}
                  trackColor={{ true: colors.accent, false: colors.surfaceEdge }}
                />
              </View>
              {quiet.enabled ? (
                <View style={styles.hourRow}>
                  <HourStepper
                    label="From"
                    value={quiet.start}
                    onChange={(d) => shiftHour('start', d)}
                  />
                  <HourStepper
                    label="To"
                    value={quiet.end}
                    onChange={(d) => shiftHour('end', d)}
                  />
                </View>
              ) : null}
            </Card>

            <View style={styles.section}>
              <Text variant="heading" weight="bold">
                Missing a category?
              </Text>
              <Text variant="small" tone="secondary">
                Suggest one and we will review it.
              </Text>
              <TextField
                placeholder="e.g. Gardening help"
                value={suggestion}
                onChangeText={setSuggestion}
                editable={!suggesting}
              />
              <Button
                label="Suggest"
                variant="secondary"
                onPress={submitSuggestion}
                busy={suggesting}
                disabled={!suggestion.trim()}
              />
            </View>

            <View style={styles.saveWrap}>
              <Button label="Save" onPress={save} busy={saving} />
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function HourStepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (delta: number) => void;
}) {
  const { colors } = useTheme();
  const hh = `${value.toString().padStart(2, '0')}:00`;
  return (
    <View style={styles.stepper}>
      <Text variant="small" tone="secondary">
        {label}
      </Text>
      <View style={styles.stepperControls}>
        <Pressable
          onPress={() => onChange(-1)}
          style={[styles.stepBtn, { borderColor: colors.surfaceEdge }]}
          hitSlop={6}
        >
          <Ionicons name="remove" size={20} color={colors.textPrimary} />
        </Pressable>
        <Text variant="heading" weight="bold" style={styles.hhText}>
          {hh}
        </Text>
        <Pressable
          onPress={() => onChange(1)}
          style={[styles.stepBtn, { borderColor: colors.surfaceEdge }]}
          hitSlop={6}
        >
          <Ionicons name="add" size={20} color={colors.textPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderRadius: radii.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  section: { gap: spacing.sm, marginTop: spacing.md },
  reachHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  slider: { width: '100%', height: 40, marginTop: spacing.sm },
  sliderEnds: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -spacing.xs },
  quietHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  hourRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.md },
  stepper: { flex: 1, gap: spacing.xs },
  stepperControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hhText: { fontVariant: ['tabular-nums'] },
  saveWrap: { marginTop: spacing.xl },
});
