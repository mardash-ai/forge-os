/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emit a minimal standalone server (.next/standalone) for a slim production
  // image — only the files + node_modules the server actually needs.
  output: 'standalone',

  // C10 · Identity / Auth — proxy the platform's HOSTED auth surface same-origin
  // so the `forge_session` cookie lands on OUR domain (SameSite=Lax needs that).
  // The rewrite runs server-side: the browser only ever talks to our origin;
  // Next forwards /auth/* to the Forge data-plane sidecar (single-app, so it
  // infers the app — no app param needed). We ship NO auth UI of our own.
  //
  // IMPORTANT: Next evaluates rewrites() at BUILD time and bakes the result into
  // the image, but FORGE_DATA_PLANE_URL is a RUNTIME var (set by compose, ABSENT
  // in the CI image build). A bare `if (!url) return []` therefore compiled the
  // rewrite AWAY in the published image → /auth/* 404'd → nobody could sign in.
  // So default to the stable in-cluster sidecar address and ALWAYS emit the
  // rewrite; a runtime FORGE_DATA_PLANE_URL still overrides it under `next dev`.
  async rewrites() {
    const dataPlane = (process.env.FORGE_DATA_PLANE_URL || 'http://data-plane:3718').replace(/\/$/, '');
    return [{ source: '/auth/:path*', destination: `${dataPlane}/auth/:path*` }];
  },
};

export default nextConfig;
