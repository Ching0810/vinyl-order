import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    // Dev only: skip the image optimizer so the browser loads images directly.
    // Next 16's optimizer refuses to fetch private/loopback IPs (SSRF defense),
    // and our dev upload host (localhost:3001) is loopback. In production images
    // come from a public GCS URL, so optimization stays on.
    unoptimized: process.env.NODE_ENV === 'development',
    // Allowlist hosts next/image may load (enforced when optimization is on):
    // - i.discogs.com: Discogs cover art (imported products)
    // - localhost:3001/uploads: images uploaded to the dev StorageService
    remotePatterns: [
      { protocol: 'https', hostname: 'i.discogs.com', pathname: '/**' },
      { protocol: 'http', hostname: 'localhost', port: '3001', pathname: '/uploads/**' },
    ],
  },
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
