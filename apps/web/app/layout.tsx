import type { Metadata } from 'next';

import AppProviders from './app-providers';

export const metadata: Metadata = {
  title: 'Vinyl Order',
  description: 'Vinyl record ordering system',
};

const RootLayout = ({ children }: Readonly<{ children: React.ReactNode }>) => (
  <html lang="en" suppressHydrationWarning>
    <body>
      <AppProviders>{children}</AppProviders>
    </body>
  </html>
);

export default RootLayout;
