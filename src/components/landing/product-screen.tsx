"use client";

import Image from "next/image";
import { useState, useRef } from "react";

/** Real product views, selected by the visitor rather than an autoplay carousel. */
export function ProductScreen({ label, views }: { label: string; views: { key: string; title: string; alt: string }[] }) {
  const [selected, setSelected] = useState(0);
  const animateSelection = useRef(false);
  const view = views[selected];
  return <div data-product-screen>
    <div role="group" aria-label={label} className="flex min-h-14 flex-wrap items-center justify-center gap-1 border-b border-border bg-background px-2 py-1.5">
      {views.map((option, index) => <button key={option.key} type="button" aria-pressed={selected === index}
        onClick={event => { animateSelection.current = event.detail > 0 && index !== selected; setSelected(index); }}
        className={`min-h-11 rounded-lg px-3 py-2 text-xs font-medium transition-colors md:px-4 md:text-sm ${selected === index ? "bg-primary/10 text-primary" : "text-text-secondary hover:bg-muted"}`}>
        {option.title}
      </button>)}
    </div>
    <div className="relative aspect-[8/5] overflow-hidden bg-background">
      {(["light", "dark"] as const).map(theme => <Image key={`${view.key}-${theme}`}
        src={`/landing/${view.key}-${theme}.webp`} alt={view.alt} width={2000} height={1250}
        fetchPriority={selected === 0 ? "high" : "auto"} sizes="(min-width: 1264px) 1200px, 96vw"
        onLoad={event => {
          const image = event.currentTarget;
          if (!animateSelection.current || !image.checkVisibility() || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
          image.animate([{ opacity: .7, transform: "scale(.985)" }, { opacity: 1, transform: "scale(1)" }], {
            duration: 200, easing: "cubic-bezier(0.23, 1, 0.32, 1)",
          });
        }}
        className={`h-auto w-full ${theme === "light" ? "dark:hidden" : "hidden dark:block"}`} />)}
    </div>
  </div>;
}
