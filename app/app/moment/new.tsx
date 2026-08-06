import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Button, Screen, Text, TextField } from '@/components/ui';
import { useAuth } from '@/lib/auth/AuthProvider';
import { proposeSelfie } from '@/lib/moments';
import { uploadMomentPhoto } from '@/lib/photo/momentPhoto';
import { radius as radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

// Propose a shared selfie after a completed help (PRD 8.4). It goes to the feed
// only after the OTHER person approves; either of you can remove it any time.
export default function NewMoment() {
  const { colors } = useTheme();
  const { session } = useAuth();
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const [base64, setBase64] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);

  async function pick(fromCamera: boolean) {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow access in Settings to add a photo.');
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true });
    if (result.canceled || !result.assets[0]?.base64) return;
    setBase64(result.assets[0].base64);
    setPreview(result.assets[0].uri);
  }

  async function share() {
    if (!base64 || !session || !requestId) return;
    setBusy(true);
    try {
      const url = await uploadMomentPhoto(session.user.id, base64);
      await proposeSelfie(requestId, url, caption);
      Alert.alert(
        'Shared for approval',
        'Your neighbour will be asked to approve. It appears in Moments only if you both agree.',
        [{ text: 'Done', onPress: () => router.back() }],
      );
    } catch (e) {
      Alert.alert('Could not share', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={26} color={colors.textPrimary} />
        </Pressable>
        <Text variant="heading" weight="bold" style={styles.topTitle}>
          Share a moment
        </Text>
        <View style={{ width: 26 }} />
      </View>

      {preview ? (
        <Pressable onPress={() => pick(false)}>
          <Image source={{ uri: preview }} style={styles.photo} contentFit="cover" />
        </Pressable>
      ) : (
        <View style={styles.pickRow}>
          <PickTile icon="camera" label="Take photo" onPress={() => pick(true)} />
          <PickTile icon="images" label="Choose photo" onPress={() => pick(false)} />
        </View>
      )}

      <TextField
        label="Add a caption (optional)"
        placeholder="e.g. Fixed a flat tyre together!"
        value={caption}
        onChangeText={setCaption}
        maxLength={140}
        editable={!busy}
        style={{ marginTop: spacing.lg }}
      />

      <Text variant="small" tone="faint" style={styles.note}>
        Both of you must agree before this appears in Moments. Either of you can
        remove it at any time. Moments are never searchable and never link to a
        profile.
      </Text>

      <View style={styles.share}>
        <Button label="Share for approval" onPress={share} busy={busy} disabled={!base64} />
      </View>
    </Screen>
  );
}

function PickTile({
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
    <Pressable
      onPress={onPress}
      style={[styles.pickTile, { backgroundColor: colors.surface, borderColor: colors.surfaceEdge }]}
    >
      <Ionicons name={icon} size={28} color={colors.accent} />
      <Text variant="label" weight="semibold">
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.md },
  topTitle: { flex: 1, textAlign: 'center' },
  pickRow: { flexDirection: 'row', gap: spacing.md },
  pickTile: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radii.xl,
    paddingVertical: spacing.xxl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  photo: { width: '100%', aspectRatio: 1, borderRadius: radii.xl },
  note: { marginTop: spacing.lg },
  share: { marginTop: spacing.xl },
});
