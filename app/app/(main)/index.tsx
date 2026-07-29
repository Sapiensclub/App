import { useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth/AuthProvider';
import { colors } from '@/theme/tokens';

// Temporary signed-in landing. Proves auth + session persistence work.
// Replaced by the real four-tab home (Home / Moments / Inbox / You) in Chunk D.
export default function Home() {
  const { session, signOut } = useAuth();
  const [busy, setBusy] = useState(false);

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
    <SafeAreaView style={styles.screen}>
      <View style={styles.body}>
        <Text style={styles.title}>You're in 🎉</Text>
        <Text style={styles.subtitle}>Signed in as</Text>
        <Text style={styles.email}>{session?.user.email}</Text>

        <View style={styles.card}>
          <Text style={styles.cardText}>
            Auth works. Your session is saved securely on this device — close
            the app and reopen; you'll still be here. The real home screen
            arrives next.
          </Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          onPress={onSignOut}
          disabled={busy}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>
            {busy ? 'Signing out…' : 'Sign out'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 10,
  },
  title: { fontSize: 32, fontWeight: '800', color: colors.ink },
  subtitle: { fontSize: 15, color: colors.inkSoft, marginTop: 8 },
  email: { fontSize: 18, fontWeight: '700', color: colors.ink },
  card: {
    marginTop: 20,
    backgroundColor: colors.cloud,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#EDE6DA',
  },
  cardText: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.ink,
    textAlign: 'center',
  },
  button: {
    marginTop: 28,
    borderWidth: 1.5,
    borderColor: colors.spark,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 40,
    minHeight: 52,
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  buttonText: { color: colors.spark, fontSize: 17, fontWeight: '700' },
});
