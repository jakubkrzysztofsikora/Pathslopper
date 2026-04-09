/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a minimal self-contained server bundle for the Docker runner stage.
  // See Dockerfile — the runner copies .next/standalone + .next/static only.
  output: "standalone",
  experimental: {
    typedRoutes: false,
  },
};

export default nextConfig;
