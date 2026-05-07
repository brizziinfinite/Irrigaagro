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

};

export default withBundleAnalyzer(nextConfig);
