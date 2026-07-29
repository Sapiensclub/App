import {
  NunitoSans_400Regular,
  NunitoSans_500Medium,
  NunitoSans_600SemiBold,
  NunitoSans_700Bold,
  NunitoSans_800ExtraBold,
} from '@expo-google-fonts/nunito-sans';
import {
  CabinSketch_400Regular,
  CabinSketch_700Bold,
} from '@expo-google-fonts/cabin-sketch';
import { useFonts } from 'expo-font';

// Registers the brand fonts (matching the website: Nunito Sans for body,
// Cabin Sketch for display/headlines). Returns [loaded, error] from useFonts;
// the root layout holds the splash until this resolves so text never flashes
// in a fallback system font.
export function useAppFonts() {
  return useFonts({
    NunitoSans_400Regular,
    NunitoSans_500Medium,
    NunitoSans_600SemiBold,
    NunitoSans_700Bold,
    NunitoSans_800ExtraBold,
    CabinSketch_400Regular,
    CabinSketch_700Bold,
  });
}
