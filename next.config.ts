import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Weby nemovitostí byly dřív na /w/[adresa] — staré odkazy přesměrovat na krátkou adresu
  async redirects() {
    return [{ source: "/w/:path*", destination: "/:path*", permanent: true }];
  },
  images: {
    // Fotky nahrané do Supabase Storage (bucket photos)
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
    ],
  },
};

export default nextConfig;
