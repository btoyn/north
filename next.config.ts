import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The in-app guide renders docs/USER_GUIDE.md at request time, and that file
  // lives outside the bundle, so trace it into the /guide serverless function.
  outputFileTracingIncludes: {
    "/guide": ["./docs/USER_GUIDE.md"],
  },

  // Spheres became Tiers and lenders became partners. Anyone with an old
  // address bookmarked, or a link sitting in a text message, still lands in the
  // right place.
  async redirects() {
    return [
      { source: "/spheres", destination: "/tiers", permanent: true },
      { source: "/spheres/:key", destination: "/tiers/:key", permanent: true },
      { source: "/lenders", destination: "/partners", permanent: true },
      { source: "/lenders/:path*", destination: "/partners/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
