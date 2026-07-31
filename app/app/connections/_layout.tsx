import { Stack } from 'expo-router';

import { useTheme } from '@/theme/useTheme';

export default function ConnectionsLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}
