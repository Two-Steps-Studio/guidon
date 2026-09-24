import { ImageResponse } from "next/og";

// Generated at request time by Next.js (no headless browser, no build-time
// asset) via Satori - picked up automatically for the root route's
// og:image/twitter:image meta tags. Replaces a plain 769x285 logo PNG,
// which rendered as a mostly-empty white card on most link-preview
// surfaces (Twitter/X, Slack, Discord, LinkedIn) since its aspect ratio and
// transparent background don't match the 1200x630 convention those
// platforms expect - a real problem for a marketing page whose main
// organic-acquisition channel is people sharing the link.
//
// Satori only supports a constrained CSS subset (flexbox layout, no
// `filter`), so this reproduces the brand look with plain shapes/text
// instead of the site's actual logo asset (which needs a CSS invert filter
// to go from black-on-transparent to white-on-dark) or the Fraunces
// display font (next/font must be loaded as a raw buffer for Satori, not
// through the normal Next.js font pipeline).

export const alt = "Guidon - Context-First Project Management";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#101317",
          backgroundImage: "linear-gradient(135deg, #101317 0%, #16191f 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginBottom: 36,
          }}
        >
          <div
            style={{
              display: "flex",
              width: 56,
              height: 56,
              borderRadius: 14,
              backgroundColor: "#4d8dff",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 34,
              fontWeight: 700,
              color: "#05142e",
            }}
          >
            G
          </div>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 700, color: "#f5f6f7", letterSpacing: -1 }}>
            GUIDON
          </div>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 54,
            fontWeight: 700,
            color: "#f5f6f7",
            textAlign: "center",
            maxWidth: 980,
            lineHeight: 1.15,
            letterSpacing: -1,
          }}
        >
          Context-First Project Management
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 26,
            color: "#8b93a1",
            textAlign: "center",
            maxWidth: 820,
            marginTop: 22,
            lineHeight: 1.4,
          }}
        >
          Track tasks, decisions, sources, and project memory together.
        </div>
        <div style={{ display: "flex", fontSize: 22, fontWeight: 600, color: "#4d8dff", marginTop: 44 }}>
          useguidon.com
        </div>
      </div>
    ),
    { ...size }
  );
}
