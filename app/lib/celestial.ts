// Maps the stored celestial_stage enum to a friendly label + icon.
// The Celestial Journey (PRD 7.8): new moon → crescent → half → full →
// sunrise → golden sun → galaxy, driven by unique helps. Phase 3 builds the
// full visual; this is just the label used on the Home glance and You tab.
import type { Ionicons } from '@expo/vector-icons';

type StageInfo = { label: string; icon: keyof typeof Ionicons.glyphMap };

const STAGES: Record<string, StageInfo> = {
  new_moon: { label: 'New moon', icon: 'moon-outline' },
  crescent: { label: 'Crescent moon', icon: 'moon-outline' },
  half_moon: { label: 'Half moon', icon: 'moon-outline' },
  full_moon: { label: 'Full moon', icon: 'moon' },
  sunrise: { label: 'Sunrise', icon: 'partly-sunny-outline' },
  golden_sun: { label: 'Golden sun', icon: 'sunny' },
  galaxy: { label: 'Joined the galaxy', icon: 'planet' },
};

export function celestialInfo(stage: string): StageInfo {
  return STAGES[stage] ?? STAGES.new_moon;
}
