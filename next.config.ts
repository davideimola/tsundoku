import type { NextConfig } from "next";

// Deliberately bare. The app is one Next.js application holding both doors — the
// web view and, later, the MCP route handler — over one core module (ADR-0002),
// and neither door needs a build-time option to exist.
const nextConfig: NextConfig = {};

export default nextConfig;
