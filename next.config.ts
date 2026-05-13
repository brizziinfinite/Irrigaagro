import type { NextConfig } from "next";
import BundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = BundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

const nextConfig: NextConfig = {
  // Compressão gzip/brotli das respostas — reduz bundle ~70% no wire
  compress: true,

  // Otimização de pacotes — garante tree-shaking correto do lucide-react e date-fns
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns', 'recharts'],
  },

  // Domínios permitidos para next/image (fotos de diagnóstico de solo, NDVI via Supabase Storage)
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default withBundleAnalyzer(nextConfig);
