import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  // busybox httpd serves files as they are: there is no image optimizer.
  images: { unoptimized: true },
};

export default nextConfig;
