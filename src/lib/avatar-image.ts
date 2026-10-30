import { getImageProps } from "next/image";

/** Only the configured public avatar bucket is safe for the shared optimizer. */
export function optimizedAvatarProps(src: unknown, width: string | number, height: string | number, alt: string, supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL) {
  if (typeof src !== "string" || !supabaseUrl) return undefined;
  try {
    const url = new URL(src), configured = new URL(supabaseUrl);
    if (url.protocol !== "https:" || url.origin !== configured.origin || url.username || url.password || url.search || !url.pathname.startsWith("/storage/v1/object/public/avatars/")) return undefined;
    return getImageProps({ src, width: Math.max(1, Math.round(Number(width) || 64)), height: Math.max(1, Math.round(Number(height) || 64)), alt }).props;
  } catch { return undefined; }
}
