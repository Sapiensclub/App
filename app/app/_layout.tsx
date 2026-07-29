import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { AuthProvider, useAuth } from '@/lib/auth/AuthProvider';
import { useAppFonts } from '@/theme/fonts';
import { colors } from '@/theme/tokens';

// Keep the native splash up until we know both (a) the brand fonts are loaded
// and (b) whether there's a saved session — so the app never flashes a
// fallback font or the sign-in screen at an already-logged-in user.
SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { session, initializing } = useAuth();
  const [fontsLoaded, fontError] = useAppFonts();

  const ready = !initializing && (fontsLoaded || !!fontError);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null; // splash screen stays visible

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.paper },
      }}
    >
      {/* Exactly one group is reachable at a time. When `session` flips
          (after signing in, or signing out), expo-router swaps groups
          automatically — no manual navigation needed. */}
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(main)" />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
      <StatusBar style="dark" />
    </AuthProvider>
  );
}
