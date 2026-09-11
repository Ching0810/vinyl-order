import type { ReactNode } from 'react';

import Guard from '@/components/admin/guard';
import AdminNav from '@/components/admin/nav';
import PageShell from '@/components/layout/page-shell';

// server component — composes the shell; the guard and nav are client islands.

/**
 * Shell shared by every admin screen.
 *
 * Admin pages previously rendered a bare Container with no header or footer, so
 * moving between the shop and the tools felt like leaving the site. They now
 * sit inside the same chrome as the storefront, with an admin sub-nav below it.
 *
 * Guard lives here rather than on each page: one gate covering the whole
 * segment can't be forgotten when a route is added. It remains a UX gate only —
 * RolesGuard on the API is the real boundary.
 */
const AdminLayout = ({ children }: { children: ReactNode }) => (
  <PageShell nav={<AdminNav />}>
    <Guard>{children}</Guard>
  </PageShell>
);

export default AdminLayout;
