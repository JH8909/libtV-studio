import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@libtv/canvas", "@libtv/editor", "@libtv/shared"],
};

export default nextConfig;
