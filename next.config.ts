import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // These are the exact Vercel variable names. The Supabase URL and anon key
  // are public client configuration; never put a service-role key here.
  env: {
    SUPABASE_URL: process.env.SUPABASE_URL,
    NEXT_SUPABASE_ANON_KEY: process.env.NEXT_SUPABASE_ANON_KEY,
  },
};

export default nextConfig;
