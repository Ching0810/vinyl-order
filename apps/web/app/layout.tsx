import './globals.css';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Vinyl Order',
  description: 'Vinyl record ordering system',
};

const RootLayout = ({ children }: Readonly<{ children: React.ReactNode }>) => (
  <html lang="en">
    <body>{children}</body>
  </html>
);

export default RootLayout;
