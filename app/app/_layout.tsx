import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { track } from '@/lib/analytics';
import { AuthProvider, useAuth } from '@/lib/auth/AuthProvider';
import { ProfileProvider, useProfile } from '@/lib/profile/ProfileProvider';
import { useAppFonts } from '@/theme/fonts';
import { useTheme } from '@/theme/useTheme';

// Keep the native splash up until we know the brand fonts are loaded, whether
// there's a saved session, and (if signed in) whether onboarding is done — so
// the app never flashes the wrong screen at the user.
SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { session, initializing } = useAuth();
  const { onboarded } = useProfile();
  const { colors, scheme } = useTheme();
  const [fontsLoaded, fontError] = useAppFonts();

  const signedIn = !!session;
  const onboardingKnown = !signedIn || onboarded !== null;
  const ready =
    !initializing && onboardingKnown && (fontsLoaded || !!fontError);

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
        {/* Exactly one group is reachable at a time; expo-router swaps groups
            automatically when session / onboarded flips. */}
        <Stack.Protected guard={signedIn && onboarded === true}>
          <Stack.Screen name="(main)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && onboarded === false}>
          <Stack.Screen name="(onboarding)" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
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
      <ProfileProvider>
        <RootNavigator />
      </ProfileProvider>
    </AuthProvider>
  );
}
