import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this folder — a stray lockfile in the user
  // profile directory otherwise makes Next.js guess the wrong root.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
