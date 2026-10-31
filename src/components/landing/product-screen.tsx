"use client";

import Image from "next/image";
import { useState } from "react";

/** Real product views, selected by the visitor rather than an autoplay carousel. */
export function ProductScreen({ label, views }: { label: string; views: { key: string; title: string; alt: string }[] }) {
  const [selected, setSelected] = useState(0);
  const view = views[selected];
  return <div data-product-screen>
    <div className="relative aspect-[8/5] overflow-hidden bg-background">
      {(["light", "dark"] as const).map(theme => <Image key={theme}
        src={`/landing/${view.key}-${theme}.webp`} alt={view.alt} width={2000} height={1250}
        priority={selected === 0} sizes="(min-width: 1152px) 1000px, 88vw"
        className={`h-auto w-full ${theme === "light" ? "dark:hidden" : "hidden dark:block"}`} />)}
      <span data-motion-actor="screen-light" aria-hidden="true" />
    </div>
    <div role="group" aria-label={label} className="flex flex-wrap justify-center gap-1 border-t border-border bg-background p-2">
      {views.map((option, index) => <button key={option.key} type="button" aria-pressed={selected === index}
        onClick={() => setSelected(index)}
        className={`min-h-11 rounded-md px-3 py-2 text-xs font-medium transition-colors md:text-sm ${selected === index ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
        {option.title}
      </button>)}
    </div>
  </div>;
}
