import type { NextConfig } from 'next';

// Where /api/* is forwarded: the API's own address, never sent to the browser.
// Read when the config loads — at build time on Vercel — so it must be set
// for the build, not only at runtime.
const apiOrigin = process.env.API_ORIGIN ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  // The browser calls the API through this app, as /api/*, so to the browser
  // there is one site: the API's auth cookie is first-party, and sameSite=lax
  // keeps working once the two are deployed apart (docs/design/deploy.md
  // §6.1). The prefix is ours alone and is dropped on the way: /api/products
  // reaches the API as /products. No route of this app lives under /api.
  rewrites() {
    return [{ source: '/api/:path*', destination: `${apiOrigin}/:path*` }];
  },
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
    // @chakra-ui/react is a large barrel export; this loads only the modules
    // actually imported, cutting bundle size and dev compile time.
    optimizePackageImports: ['@chakra-ui/react'],
  },
};

export default nextConfig;
