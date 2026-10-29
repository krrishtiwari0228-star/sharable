import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Supabase URL is public configuration. Map the user's Vercel variable
  // name to the standard Next.js public variable at build time.
  env: {
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
  },
};

export default nextConfig;
