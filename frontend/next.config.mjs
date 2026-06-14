/** @type {import('next').NextConfig} */
const nextConfig = {
  // tsc is the typecheck gate (npm run typecheck); next build still typechecks.
  // ESLint isn't wired for this demo — skip it during build rather than fail.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
