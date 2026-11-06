import { SITE_URL } from "@/lib/site-url";

/**
 * RFC 9116 security.txt: where to report a vulnerability. Expires must be
 * under a year ahead, so it is computed per request instead of going stale.
 */
export function GET() {
  const expires = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
  const body = [
    "Contact: mailto:security@useguidon.com",
    `Contact: ${SITE_URL}/contact`,
    `Expires: ${expires}`,
    "Preferred-Languages: en, pl",
    `Canonical: ${SITE_URL}/.well-known/security.txt`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
}

export { GET as HEAD };
