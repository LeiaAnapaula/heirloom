import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // The dev badge sits on top of the 3D world's move pad and shows up in demo recordings.
  devIndicators: false,
  partialPrefetching: true,
  // Let an iPad on the same wifi load the dev server (http://<your-mac>.local:3000 or its 192.168.x.x address).
  allowedDevOrigins: ["*.local", "192.168.*.*", "10.*.*.*", "172.*.*.*"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
