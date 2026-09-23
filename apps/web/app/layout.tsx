import type { Metadata } from 'next';

import AppProviders from './app-providers';

export const metadata: Metadata = {
  title: 'Vinyl Order',
  description: 'Vinyl record ordering system',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
