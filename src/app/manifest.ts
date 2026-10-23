import type { MetadataRoute } from "next";
import { BRAND_COLORS } from "@/lib/brand-colors";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Guidon",
    short_name: "Guidon",
    description: "Context-first project management for development teams.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: BRAND_COLORS.blue,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
