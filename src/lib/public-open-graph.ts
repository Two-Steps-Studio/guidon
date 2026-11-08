import type { Metadata } from "next";

/** Page-level Open Graph fields are replaced as a unit by Next.js. */
export function publicOpenGraph(path: string): Metadata["openGraph"] {
  return {
    type: "website",
    siteName: "Guidon",
    url: path,
    images: [{ url: "/opengraph-image.png", width: 1200, height: 630, alt: "Guidon project management" }],
  };
}
