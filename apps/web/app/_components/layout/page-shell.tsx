import { Box } from '@chakra-ui/react';
import type { ReactNode } from 'react';

import Footer from '@/components/layout/footer';
import Header from '@/components/layout/header';

// server component — pure composition; Header is the only client island.

/**
 * The standard page frame: sticky header, content, footer pinned to the bottom
 * of short pages.
 *
 * Every full-page route needs this identical `100dvh` flex column, so it lives
 * in one place rather than being retyped per route.
 *
 * @param children - the page body
 * @param nav - optional bar rendered directly under the header (the admin
 *   area uses it for its sub-navigation)
 */
const PageShell = ({ children, nav }: { children: ReactNode; nav?: ReactNode }) => (
  <Box minH="100dvh" display="flex" flexDirection="column">
    <Header />
    {nav}
    <Box flex="1">{children}</Box>
    <Footer />
  </Box>
);

export default PageShell;
