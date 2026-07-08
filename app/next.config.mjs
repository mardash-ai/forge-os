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
  //
  // C15 · Status page + C16 · Theming — the platform data-plane ALSO serves the
  // public `/status` + `/status.json` (aggregating our C6 /api/health) and the
  // branded `/theme.css` (the `--forge-*` tokens from forge.theme.json). Proxy all
  // three same-origin with the SAME always-on pattern as /auth/* (never gated on a
  // build-absent env, per P11) so they survive `next build` and work in dev + prod.
  // The gate (middleware.ts) treats /status + /status.json as PUBLIC so /status
  // renders with no login redirect; /theme.css is a static-asset path the matcher
  // already skips.
  async rewrites() {
    const dataPlane = (process.env.FORGE_DATA_PLANE_URL || 'http://data-plane:3718').replace(/\/$/, '');
    return [
      { source: '/auth/:path*', destination: `${dataPlane}/auth/:path*` },
      { source: '/status', destination: `${dataPlane}/status` },
      { source: '/status.json', destination: `${dataPlane}/status.json` },
      { source: '/theme.css', destination: `${dataPlane}/theme.css` },
    ];
  },
};

export default nextConfig;
