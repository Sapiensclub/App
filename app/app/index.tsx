import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '@/theme/tokens';

// Temporary placeholder screen — proves the scaffold runs on a real phone.
// Replaced by auth + the real home screen later in Phase 0.
export default function Index() {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.center}>
        <Text style={styles.title}>Sapiens</Text>
        <Text style={styles.subtitle}>People helping people, nearby.</Text>
        <View style={styles.card}>
          <Text style={styles.cardText}>
            Foundation laid. If you can read this on your phone, the scaffold
            works — Phase 0 is underway.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 40,
    fontWeight: '700',
    color: colors.ink,
  },
  subtitle: {
    fontSize: 18,
    color: colors.inkSoft,
    textAlign: 'center',
  },
  card: {
    marginTop: 24,
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
});
