// The Celestial Journey (PRD 7.8): new moon → crescent → half → full →
// sunrise → golden sun, driven by unique helps (people reached).
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

// Ordered stages with the unique-help threshold that unlocks each.
export const STAGE_LADDER: { key: string; at: number }[] = [
  { key: 'new_moon', at: 0 },
  { key: 'crescent', at: 10 },
  { key: 'half_moon', at: 50 },
  { key: 'full_moon', at: 100 },
  { key: 'sunrise', at: 500 },
  { key: 'golden_sun', at: 1000 },
];

// Milestones that ripple out to your connections (PRD 8.5).
export const MILESTONES = [1, 3, 10, 50, 100, 500, 1000];

export type JourneyProgress = {
  stageKey: string;
  label: string;
  /** Threshold of the current stage. */
  current: number;
  /** Next stage threshold, or null at the top. */
  next: number | null;
  nextLabel: string | null;
  /** 0..1 progress from the current stage to the next. */
  fraction: number;
};

export function journeyProgress(unique: number): JourneyProgress {
  let idx = 0;
  for (let i = 0; i < STAGE_LADDER.length; i++) {
    if (unique >= STAGE_LADDER[i].at) idx = i;
  }
  const cur = STAGE_LADDER[idx];
  const nxt = STAGE_LADDER[idx + 1] ?? null;
  const fraction = nxt ? Math.min(1, (unique - cur.at) / (nxt.at - cur.at)) : 1;
  return {
    stageKey: cur.key,
    label: STAGES[cur.key].label,
    current: cur.at,
    next: nxt?.at ?? null,
    nextLabel: nxt ? STAGES[nxt.key].label : null,
    fraction,
  };
}
