import { ImageResponse } from "next/og";
import { BRAND_COLORS } from "@/lib/brand-colors";

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

export const alt = "Guidon - Hand the task to your AI agent. It already knows the project.";
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
          backgroundColor: BRAND_COLORS.midnightNavy,
          backgroundImage: `linear-gradient(135deg, ${BRAND_COLORS.midnightNavy} 0%, #10264a 100%)`,
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
              backgroundColor: BRAND_COLORS.blue,
              alignItems: "center",
              justifyContent: "center",
              fontSize: 34,
              fontWeight: 700,
              color: BRAND_COLORS.white,
            }}
          >
            G
          </div>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 700, color: BRAND_COLORS.white, letterSpacing: -1 }}>
            GUIDON
          </div>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 54,
            fontWeight: 700,
            color: BRAND_COLORS.white,
            textAlign: "center",
            maxWidth: 980,
            lineHeight: 1.15,
            letterSpacing: -1,
          }}
        >
          Hand the task to your AI agent. It already knows the project.
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 26,
            color: "#B4BAC4",
            textAlign: "center",
            maxWidth: 820,
            marginTop: 22,
            lineHeight: 1.4,
          }}
        >
          Claude Code, Codex or Cursor take tasks with decisions, memory and earlier attempts - and hand them back for review.
        </div>
        <div style={{ display: "flex", fontSize: 22, fontWeight: 600, color: BRAND_COLORS.electricBlue, marginTop: 44 }}>
          useguidon.com
        </div>
      </div>
    ),
    { ...size }
  );
}
