import { Container } from '@chakra-ui/react';

import PageShell from '@/components/layout/page-shell';
import Notifications from '@/components/notifications';
import SectionHeading from '@/components/ui/section-heading';

/** `/notifications` — price drops of what the signed-in user tracks (tracker.md §12.3). */
export default function NotificationsPage() {
  return (
    <PageShell>
      <Container maxW="4xl" px={{ base: '4', md: '8' }} py={{ base: '10', md: '16' }}>
        <SectionHeading eyebrow="Your account" title="Notifications" />
        <Notifications />
      </Container>
    </PageShell>
  );
}
