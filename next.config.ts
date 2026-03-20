import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['argon2', '@prisma/client', 'prisma'],
};

export default nextConfig;
