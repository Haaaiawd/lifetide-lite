import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["@napi-rs/canvas", "pdfjs-dist", "pdf-to-png-converter"],
  // Allow large file uploads via Route Handlers.
  // serverActions.bodySizeLimit covers Server Actions only;
  // proxyClientMaxBodySize covers Route Handlers (the /api/uploads path).
  // Without this, Next.js 15.5+ silently truncates multipart bodies >1MB.
  experimental: {
    serverActions: {
      bodySizeLimit: "15mb",
    },
    proxyClientMaxBodySize: "15mb",
  },
};

export default nextConfig;
