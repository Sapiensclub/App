import { EmptyState, Screen } from '@/components/ui';

// The permanent inbox (PRD Bucket 6) — messaging between connections — is
// built in Phase 4. For now, the warm empty state from PRD 10.13.
export default function Inbox() {
  return (
    <Screen scroll={false} padded={false}>
      <EmptyState
        icon="chatbubbles-outline"
        title="Your inbox is quiet"
        body="Help someone, and your first connection begins here."
      />
    </Screen>
  );
}
