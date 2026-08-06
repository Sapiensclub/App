import type { MyProfile } from '@/lib/profile/ProfileProvider';

export type Restriction = {
  restricted: boolean;
  banned: boolean;
  suspendedUntil: Date | null;
};

/** Derive the caller's restriction state from their profile (server-enforced too). */
export function restrictionState(profile: MyProfile | null): Restriction {
  if (!profile) return { restricted: false, banned: false, suspendedUntil: null };
  const banned = !!profile.banned_at;
  const until = profile.suspended_until ? new Date(profile.suspended_until) : null;
  const suspended = !!until && until.getTime() > Date.now();
  return {
    restricted: banned || suspended,
    banned,
    suspendedUntil: suspended ? until : null,
  };
}

/** Plain-language explanation for the restricted banner / alert. */
export function restrictionMessage(r: Restriction): string {
  if (r.banned) {
    return 'Your account has been suspended by our Trust & Safety team. You can’t raise or offer help. If you think this is a mistake, contact support.';
  }
  if (r.suspendedUntil) {
    return `Your account is temporarily restricted until ${r.suspendedUntil.toLocaleDateString(
      undefined,
      { month: 'long', day: 'numeric' },
    )}. You can’t raise or offer help until then.`;
  }
  return '';
}
