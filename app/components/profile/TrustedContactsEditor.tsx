import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Text, TextField } from '@/components/ui';
import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

const MAX_CONTACTS = 3;
type Contact = { name: string; phone: string };

type Props = { visible: boolean; onClose: () => void };

/**
 * Edit the 1–3 trusted contacts (PRD 1.2 / 9.6) captured at onboarding.
 * These are who SOS alerts by SMS (Phase 5). Only the owner can see them.
 */
export function TrustedContactsEditor({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const { session } = useAuth();
  const uid = session?.user.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([{ name: '', phone: '' }]);

  useEffect(() => {
    if (!visible || !uid) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('trusted_contacts')
        .select('name, phone, slot')
        .eq('user_id', uid)
        .order('slot');
      if (!alive) return;
      const rows = (data ?? []).map((r) => ({ name: r.name, phone: r.phone }));
      setContacts(rows.length ? rows : [{ name: '', phone: '' }]);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [visible, uid]);

  function setContact(i: number, patch: Partial<Contact>) {
    setContacts((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function addRow() {
    if (contacts.length < MAX_CONTACTS) setContacts((cs) => [...cs, { name: '', phone: '' }]);
  }
  function removeRow(i: number) {
    setContacts((cs) => {
      const next = cs.filter((_, idx) => idx !== i);
      return next.length ? next : [{ name: '', phone: '' }];
    });
  }

  async function save() {
    if (!uid) return;
    const partial = contacts.some(
      (c) => (c.name.trim() && !c.phone.trim()) || (!c.name.trim() && c.phone.trim()),
    );
    if (partial) {
      Alert.alert(
        'Almost there',
        'Please add both a name and a phone number for each contact, or clear the row.',
      );
      return;
    }
    const filled = contacts.filter((c) => c.name.trim() && c.phone.trim());
    setSaving(true);
    try {
      // Replace-all keeps the (user_id, slot) uniqueness simple.
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
      }
      track('trusted_contacts_updated', { count: filled.length });
      onClose();
    } catch {
      Alert.alert('Could not save', 'Please try again in a moment.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
        <View style={styles.topBar}>
          <Text variant="heading" weight="bold">
            Trusted contacts
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
          <KeyboardAvoidingView
            style={styles.flex}
            behavior="padding"
          >
            <ScrollView
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text variant="body" tone="secondary">
                Up to three people we can alert if you ever use SOS. Only you
                can see them.
              </Text>

              {contacts.map((c, i) => (
                <View key={i} style={styles.contactCard}>
                  <View style={styles.contactHeader}>
                    <Text variant="label" weight="bold" tone="secondary">
                      Contact {i + 1}
                    </Text>
                    <Pressable onPress={() => removeRow(i)} hitSlop={10} accessibilityLabel={`Remove contact ${i + 1}`}>
                      <Ionicons name="trash-outline" size={20} color={colors.textFaint} />
                    </Pressable>
                  </View>
                  <TextField
                    placeholder="Name"
                    value={c.name}
                    onChangeText={(t) => setContact(i, { name: t })}
                    autoCapitalize="words"
                    editable={!saving}
                  />
                  <TextField
                    placeholder="Phone number"
                    value={c.phone}
                    onChangeText={(t) => setContact(i, { phone: t })}
                    keyboardType="phone-pad"
                    editable={!saving}
                  />
                </View>
              ))}

              {contacts.length < MAX_CONTACTS ? (
                <Pressable onPress={addRow} hitSlop={8} style={styles.addRow} disabled={saving}>
                  <Ionicons name="add-circle-outline" size={22} color={colors.accent} />
                  <Text variant="label" weight="semibold" tone="accent">
                    Add another
                  </Text>
                </Pressable>
              ) : null}

              <View style={styles.saveWrap}>
                <Button label="Save" onPress={save} busy={saving} />
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxxl },
  contactCard: { gap: spacing.sm },
  contactHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  saveWrap: { marginTop: spacing.lg },
});
