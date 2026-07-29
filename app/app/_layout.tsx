import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { AuthProvider, useAuth } from '@/lib/auth/AuthProvider';
import { colors } from '@/theme/tokens';

// Keep the native splash up until we know whether there's a saved session,
// so the app never flashes the sign-in screen at an already-logged-in user.
SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { session, initializing } = useAuth();

  useEffect(() => {
    if (!initializing) SplashScreen.hideAsync();
  }, [initializing]);

  if (initializing) return null; // splash screen stays visible

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.paper },
      }}
    >
      {/* Exactly one group is reachable at a time. When `session` flips
          (after verifying a code, or signing out), expo-router swaps groups
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
