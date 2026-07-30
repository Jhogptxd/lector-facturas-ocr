/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Enables src/instrumentation.ts, where the debt reminder sweep is scheduled.
    instrumentationHook: true,
  },
};

export default nextConfig;
