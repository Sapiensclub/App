import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { track } from '@/lib/analytics';
import { AuthProvider, useAuth } from '@/lib/auth/AuthProvider';
import { useAppFonts } from '@/theme/fonts';
import { useTheme } from '@/theme/useTheme';

// Keep the native splash up until we know both (a) the brand fonts are loaded
// and (b) whether there's a saved session — so the app never flashes a
// fallback font or the sign-in screen at an already-logged-in user.
SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { session, initializing } = useAuth();
  const { colors, scheme } = useTheme();
  const [fontsLoaded, fontError] = useAppFonts();

  const ready = !initializing && (fontsLoaded || !!fontError);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  // Fire once per app launch.
  useEffect(() => {
    track('app_opened');
  }, []);

  if (!ready) return null; // splash screen stays visible

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        {/* Exactly one group is reachable at a time. When `session` flips,
            expo-router swaps groups automatically — no manual navigation. */}
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(main)" />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
