import { EmptyState, Screen } from '@/components/ui';

// The community moments surface (PRD Bucket 8) is built in Phase 6. For now,
// the warm empty state from PRD 10.13.
export default function Moments() {
  return (
    <Screen scroll={false} padded={false}>
      <EmptyState
        icon="sparkles-outline"
        title="No moments near you yet"
        body="Be the first to help someone — moments of real help in your area will show up here."
      />
    </Screen>
  );
}
