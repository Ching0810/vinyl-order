import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    // Chakra UI v3 runs on Emotion. Without this, Emotion's global styles
    // (`css-global`) are injected on the client but not emitted during SSR,
    // causing a hydration mismatch (server `<main>` vs client `<style>`).
    // Optimizing the barrel import fixes the SSR style ordering.
    // Mirrors apps/web's sibling project cola-twtrip-temp.
    optimizePackageImports: ['@chakra-ui/react'],
  },
};

export default nextConfig;
