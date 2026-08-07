import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useEffect } from 'react';

import { useAuth } from '@/lib/auth/AuthProvider';
import { useLocationSync } from '@/lib/location/useLocationSync';
import { registerForPush } from '@/lib/push';
import { fonts } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

// The four-tab skeleton from PRD 10.3: Home · Moments · Inbox · You.
// (SOS is a persistent guarded button, not a tab — it arrives in Phase 5.
//  The notifications bell lives on Home, added in Phase 6.)
export default function MainTabsLayout() {
  const { colors } = useTheme();
  const { session } = useAuth();
  // Keep last-known location fresh (only if permission already granted) so
  // the dispatch engine can find this user as a nearby helper.
  useLocationSync();

  // Register this device for push (no-ops in Expo Go / simulator — see lib/push).
  useEffect(() => {
    if (session) registerForPush(session.user.id);
  }, [session?.user.id]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.surfaceEdge,
          height: 88,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 12 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="moments"
        options={{
          title: 'Moments',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="sparkles-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Inbox',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="you"
        options={{
          title: 'You',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
