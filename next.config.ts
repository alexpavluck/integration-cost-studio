import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project so Turbopack doesn't infer it from a
  // stray lockfile elsewhere on the machine.
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
