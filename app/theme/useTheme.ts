import { useColorScheme } from 'react-native';

import { darkColors, lightColors, type Palette } from './tokens';

export type ThemeScheme = 'light' | 'dark';

/**
 * Returns the active color palette based on the device's light/dark setting.
 * `useColorScheme` is reactive, so screens re-render automatically when the
 * system theme flips. (A manual in-app override can be layered on later.)
 */
export function useTheme(): { colors: Palette; scheme: ThemeScheme } {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  return { colors: isDark ? darkColors : lightColors, scheme: isDark ? 'dark' : 'light' };
}
