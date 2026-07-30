import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { Logo } from '@/components/Logo';
import { Button, Screen, Text, TextField } from '@/components/ui';
import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useProfile } from '@/lib/profile/ProfileProvider';
import { supabase } from '@/lib/supabase';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

type Phase = 'walk' | 'contacts' | 'welcome';

type Slide = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
};

const SLIDES: Slide[] = [
  {
    icon: 'people-outline',
    title: 'Real help, nearby',
    body: 'Sapiens is verified neighbours helping each other in person — no money, no feeds, no profiles to scroll.',
  },
  {
    icon: 'hand-left-outline',
    title: 'Two simple actions',
    body: 'Ask for a hand when you need one, or help someone nearby who does. That is the whole app.',
  },
  {
    icon: 'moon-outline',
    title: 'You collect light',
    body: 'Every first help lights your Celestial Journey — from new moon to golden sun. You grow by helping, never by scrolling.',
  },
  {
    icon: 'shield-checkmark-outline',
    title: 'Help in an emergency',
    body: 'A guarded SOS button will alert your trusted contacts and let you call for help. Let us set those contacts up next.',
  },
];

const MAX_CONTACTS = 3;
type Contact = { name: string; phone: string };

export default function Onboarding() {
  const { colors } = useTheme();
  const { session } = useAuth();
  const { markOnboarded } = useProfile();
  const [phase, setPhase] = useState<Phase>('walk');
  const [slide, setSlide] = useState(0);
  const [contacts, setContacts] = useState<Contact[]>([{ name: '', phone: '' }]);
  const [busy, setBusy] = useState(false);

  const uid = session?.user.id;

  // ── Walkthrough ──────────────────────────────────────────────────────────
  function nextSlide() {
    if (slide < SLIDES.length - 1) setSlide((s) => s + 1);
    else setPhase('contacts');
  }

  // ── Contacts ─────────────────────────────────────────────────────────────
  function setContact(i: number, patch: Partial<Contact>) {
    setContacts((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function addRow() {
    if (contacts.length < MAX_CONTACTS) setContacts((cs) => [...cs, { name: '', phone: '' }]);
  }

  async function saveContactsAndContinue() {
    const partial = contacts.some(
      (c) => (c.name.trim() && !c.phone.trim()) || (!c.name.trim() && c.phone.trim()),
    );
    if (partial) {
      Alert.alert('Almost there', 'Please add both a name and a phone number for each contact, or clear the row.');
      return;
    }
    const filled = contacts.filter((c) => c.name.trim() && c.phone.trim());
    if (!uid) return;
    setBusy(true);
    try {
      // Replace any existing contacts so re-entering the flow can't collide
      // with the (user_id, slot) uniqueness.
      await supabase.from('trusted_contacts').delete().eq('user_id', uid);
      if (filled.length) {
        const rows = filled.map((c, i) => ({
          user_id: uid,
          name: c.name.trim(),
          phone: c.phone.trim(),
          slot: i + 1,
        }));
        const { error } = await supabase.from('trusted_contacts').insert(rows);
        if (error) throw error;
        track('trusted_contacts_added', { count: filled.length });
      }
      setPhase('welcome');
    } catch {
      Alert.alert('Could not save', 'Please try again in a moment.');
    } finally {
      setBusy(false);
    }
  }

  // ── Finish ───────────────────────────────────────────────────────────────
  async function finish() {
    setBusy(true);
    try {
      await markOnboarded(); // guard flips → lands on Home
      track('onboarding_completed');
    } finally {
      setBusy(false);
    }
  }

  if (phase === 'walk') {
    const s = SLIDES[slide];
    return (
      <Screen scroll={false}>
        <View style={styles.skipRow}>
          <Pressable onPress={() => setPhase('contacts')} hitSlop={12}>
            <Text variant="label" weight="semibold" tone="faint">
              Skip
            </Text>
          </Pressable>
        </View>
        <View style={styles.center}>
          <View style={[styles.iconCircle, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name={s.icon} size={44} color={colors.accent} />
          </View>
          <Text variant="title" center>
            {s.title}
          </Text>
          <Text variant="body" tone="secondary" center style={styles.slideBody}>
            {s.body}
          </Text>
        </View>
        <View style={styles.footer}>
          <View style={styles.dots}>
            {SLIDES.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  { backgroundColor: i === slide ? colors.accent : colors.surfaceEdge },
                ]}
              />
            ))}
          </View>
          <Button
            label={slide < SLIDES.length - 1 ? 'Next' : 'Set up safety'}
            onPress={nextSlide}
          />
        </View>
      </Screen>
    );
  }

  if (phase === 'contacts') {
    return (
      <Screen>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.contactsHeader}>
            <View style={[styles.iconCircle, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name="people-outline" size={40} color={colors.accent} />
            </View>
            <Text variant="title" center>
              Your trusted contacts
            </Text>
            <Text variant="body" tone="secondary" center>
              Add up to three people we can alert if you ever use SOS. Only you
              can see them, and you can change them anytime.
            </Text>
          </View>

          <View style={styles.contactList}>
            {contacts.map((c, i) => (
              <View key={i} style={styles.contactCard}>
                <Text variant="label" weight="bold" tone="secondary">
                  Contact {i + 1}
                </Text>
                <TextField
                  placeholder="Name"
                  value={c.name}
                  onChangeText={(t) => setContact(i, { name: t })}
                  autoCapitalize="words"
                  editable={!busy}
                />
                <TextField
                  placeholder="Phone number"
                  value={c.phone}
                  onChangeText={(t) => setContact(i, { phone: t })}
                  keyboardType="phone-pad"
                  editable={!busy}
                />
              </View>
            ))}

            {contacts.length < MAX_CONTACTS ? (
              <Pressable onPress={addRow} hitSlop={8} style={styles.addRow} disabled={busy}>
                <Ionicons name="add-circle-outline" size={22} color={colors.accent} />
                <Text variant="label" weight="semibold" tone="accent">
                  Add another
                </Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.contactsFooter}>
            <Button label="Continue" onPress={saveContactsAndContinue} busy={busy} />
            <Pressable onPress={() => setPhase('welcome')} hitSlop={12} disabled={busy} style={styles.skipLink}>
              <Text variant="label" weight="semibold" tone="faint" center>
                Skip for now
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Screen>
    );
  }

  // phase === 'welcome'
  return (
    <Screen scroll={false}>
      <View style={styles.center}>
        <Logo height={84} />
        <Text variant="display" center celebrate style={styles.welcomeTitle}>
          Welcome, Sapiens
        </Text>
        <Text variant="body" tone="secondary" center style={styles.slideBody}>
          You are part of a community building a world where helping each other
          is the default — not the exception. Look around. When you are ready to
          help or ask, we will verify you first — it keeps everyone safe.
        </Text>
      </View>
      <View style={styles.footer}>
        <Button label="Start exploring" onPress={finish} busy={busy} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  skipRow: { alignItems: 'flex-end', paddingTop: spacing.sm },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  slideBody: { maxWidth: 340 },
  footer: { gap: spacing.xl, paddingBottom: spacing.lg },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  dot: { width: 9, height: 9, borderRadius: 5 },
  contactsHeader: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
  contactList: { gap: spacing.lg },
  contactCard: { gap: spacing.sm },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  contactsFooter: { gap: spacing.md, paddingTop: spacing.xxl, paddingBottom: spacing.lg },
  skipLink: { paddingVertical: spacing.sm },
  welcomeTitle: { marginTop: spacing.md },
});
