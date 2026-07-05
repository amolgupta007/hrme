/** @type {import('next').NextConfig} */
const { withSentryConfig } = require("@sentry/nextjs");

const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    // `npm run lint` enforces lint via `--rulesdir eslint-rules` (custom rule registry).
    // `next build` doesn't accept --rulesdir, so it would fail on our custom rule ref.
    // Lint is enforced separately via the npm script.
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "img.clerk.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
    instrumentationHook: true,
    serverComponentsExternalPackages: ["@react-email/render", "@react-email/components", "@anthropic-ai/sdk", "sharp", "unpdf", "mammoth", "@react-pdf/renderer"],
    outputFileTracingIncludes: {
      "/api/cron/social-agent-generate": ["./public/Jamba-s.png"],
      "/superadmin/social/**": ["./public/Jamba-s.png"],
    },
  },
};

module.exports = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
  automaticVercelMonitors: true,
});
