/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a minimal self-contained server bundle for the Docker runner stage.
  // See Dockerfile — the runner copies .next/standalone + .next/static only.
  output: "standalone",
  experimental: {
    typedRoutes: false,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
