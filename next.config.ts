import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 生产镜像用 standalone 产物（Dockerfile 与 CI health 冒烟都依赖它）
  output: 'standalone',
  cacheComponents: true,
  partialPrefetching: true,
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
