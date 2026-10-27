"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import type { FunnelCta } from "@/lib/funnel";

/**
 * A landing-page link whose click adds one to a daily total (migration 096,
 * /api/funnel/cta). sendBeacon survives the navigation; it sends only the
 * button's name - no cookie, no identifier.
 */
export function CtaLink({ cta, onClick, ...props }: ComponentProps<typeof Link> & { cta: FunnelCta }) {
  return (
    <Link
      {...props}
      onClick={(event) => {
        try { navigator.sendBeacon?.("/api/funnel/cta", new Blob([cta], { type: "text/plain" })); } catch { /* counting never blocks the link */ }
        onClick?.(event);
      }}
    />
  );
}
