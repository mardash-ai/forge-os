/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emit a minimal standalone server (.next/standalone) for a slim production
  // image — only the files + node_modules the server actually needs.
  output: 'standalone',

  // C10 · Identity / Auth — proxy the platform's HOSTED auth surface same-origin
  // so the `forge_session` cookie lands on OUR domain (SameSite=Lax needs that).
  // The rewrite runs server-side: the browser only ever talks to our origin;
  // Next forwards /auth/* to the platform (a Forge data-plane) at
  // FORGE_DATA_PLANE_URL — a single-app data-plane sidecar in both dev and prod,
  // so it infers the app and no app param is needed. We ship NO auth UI of our own.
  async rewrites() {
    const dataPlane = process.env.FORGE_DATA_PLANE_URL;
    if (!dataPlane) return [];
    return [{ source: '/auth/:path*', destination: `${dataPlane.replace(/\/$/, '')}/auth/:path*` }];
  },
};

export default nextConfig;
