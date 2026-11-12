import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vinext also checks multipart route uploads against this limit before routing.
  // Leave room for form fields; /api/jobs still enforces an 8 MiB image limit.
  experimental: { serverActions: { bodySizeLimit: "9mb" } },
};

export default nextConfig;
