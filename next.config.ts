import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // Derived, not hand-set: the console is in demo mode exactly when no
    // backend origin is configured.
    NEXT_PUBLIC_DEMO_MODE: process.env.HITBOX_API_URL ? "false" : "true",
  },
};

export default nextConfig;
