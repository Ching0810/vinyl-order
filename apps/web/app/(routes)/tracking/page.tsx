import PageShell from '@/components/layout/page-shell';
import Tracking from '@/components/tracking';

/** `/tracking` — the versions the signed-in user tracks (tracker.md §12.1). */
export default function TrackingPage() {
  return (
    <PageShell>
      <Tracking />
    </PageShell>
  );
}
