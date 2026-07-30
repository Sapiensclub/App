import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Text, TextField } from '@/components/ui';
import { track } from '@/lib/analytics';
import { useProfile } from '@/lib/profile/ProfileProvider';
import { supabase } from '@/lib/supabase';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

const NAME_MAX = 40;
const BIO_MAX = 200;

type Props = { visible: boolean; onClose: () => void };

/**
 * Edit the profile's editable fields (PRD 9.6): first name + short bio.
 * Locked fields (verified, meters, counters, KYC identity) are not here —
 * RLS blocks them anyway.
 */
export function EditProfile({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const { profile, refetch } = useProfile();
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);

  // Re-seed the fields each time the modal opens.
  useEffect(() => {
    if (visible) {
      setName(profile?.display_name ?? '');
      setBio(profile?.bio ?? '');
    }
  }, [visible, profile?.display_name, profile?.bio]);

  async function save() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Your name', 'Please enter a first name — it is what helpers and seekers see.');
      return;
    }
    if (!profile) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: trimmedName, bio: bio.trim() || null })
        .eq('id', profile.id);
      if (error) throw error;
      track('profile_edited');
      await refetch();
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
            Edit profile
          </Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
            <Ionicons name="close" size={28} color={colors.textSecondary} />
          </Pressable>
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <TextField
              label="First name"
              placeholder="e.g. Priya"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              maxLength={NAME_MAX}
              editable={!saving}
            />
            <Text variant="small" tone="faint">
              Your first name is what people see when you help or ask for help.
            </Text>

            <TextField
              label="Short bio (optional)"
              placeholder="A line about you — e.g. Happy to help with rides and tech."
              value={bio}
              onChangeText={setBio}
              multiline
              numberOfLines={3}
              maxLength={BIO_MAX}
              style={styles.bioInput}
              editable={!saving}
            />
            <Text variant="small" tone="faint" style={styles.counter}>
              {bio.length}/{BIO_MAX}
            </Text>

            <View style={styles.saveWrap}>
              <Button label="Save" onPress={save} busy={saving} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
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
  content: { paddingHorizontal: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
  bioInput: { minHeight: 96, textAlignVertical: 'top' },
  counter: { textAlign: 'right', marginTop: -spacing.sm },
  saveWrap: { marginTop: spacing.lg },
});
