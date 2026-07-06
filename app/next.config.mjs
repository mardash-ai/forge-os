/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emit a minimal standalone server (.next/standalone) for a slim production
  // image — only the files + node_modules the server actually needs.
  output: 'standalone',
};

export default nextConfig;
