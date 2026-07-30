import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { track } from '@/lib/analytics';
import { uploadAndSetDisplayPhoto } from '@/lib/photo/displayPhoto';
import { useTheme } from '@/theme/useTheme';

type Props = {
  userId: string;
  photoUrl: string | null;
  size?: number;
  onChanged: () => void | Promise<void>;
};

/**
 * The profile avatar with tap-to-change. Picks a square image, uploads it, and
 * sets it as the display photo (the face-match against the KYC selfie is
 * stubbed to auto-accept for now — PRD 9.2).
 */
export function EditableAvatar({ userId, photoUrl, size = 96, onChanged }: Props) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);

  async function pickAndUpload() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Photo access needed',
        'Allow photo access in Settings to set your display photo.',
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });
    if (result.canceled || !result.assets[0]?.base64) return;

    setBusy(true);
    try {
      await uploadAndSetDisplayPhoto(userId, result.assets[0].base64);
      track('display_photo_set');
      await onChanged();
    } catch {
      Alert.alert('Could not update photo', 'Please try again in a moment.');
    } finally {
      setBusy(false);
    }
  }

  const radius = size / 2;

  return (
    <Pressable
      onPress={pickAndUpload}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel="Change display photo"
      style={[styles.wrap, { width: size, height: size }]}
    >
      <View
        style={[
          styles.circle,
          { width: size, height: size, borderRadius: radius, backgroundColor: colors.accentSoft },
        ]}
      >
        {photoUrl ? (
          <Image
            source={{ uri: photoUrl }}
            style={{ width: size, height: size, borderRadius: radius }}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <Ionicons name="person" size={size * 0.45} color={colors.accent} />
        )}
        {busy ? (
          <View style={[styles.overlay, { borderRadius: radius }]}>
            <ActivityIndicator color={colors.onAccent} />
          </View>
        ) : null}
      </View>

      <View style={[styles.badge, { backgroundColor: colors.accent, borderColor: colors.bg }]}>
        <Ionicons name="camera" size={16} color={colors.onAccent} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'center' },
  circle: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20,20,20,0.35)',
  },
  badge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
