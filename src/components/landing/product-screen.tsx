"use client";

import Image from "next/image";
import { useState } from "react";
import dashboardLight from "../../../public/landing/hero-dashboard-light.webp";
import dashboardDark from "../../../public/landing/hero-dashboard-dark.webp";
import boardLight from "../../../public/landing/taskBoard-light.webp";
import boardDark from "../../../public/landing/taskBoard-dark.webp";
import roadmapLight from "../../../public/landing/roadmap-light.webp";
import roadmapDark from "../../../public/landing/roadmap-dark.webp";

const screenshots = {
  "hero-dashboard": { light: dashboardLight, dark: dashboardDark },
  taskBoard: { light: boardLight, dark: boardDark },
  roadmap: { light: roadmapLight, dark: roadmapDark },
};

type ProductView = { key: keyof typeof screenshots; title: string; alt: string };

/** Real product views, selected by the visitor rather than an autoplay carousel. */
export function ProductScreen({ label, views }: { label: string; views: ProductView[] }) {
  const [selected, setSelected] = useState(0);
  const view = views[selected];
  return <div data-product-screen>
    <div role="group" aria-label={label} className="flex min-h-14 flex-wrap items-center justify-center gap-1 border-b border-border bg-background px-2 py-1.5">
      {views.map((option, index) => <button key={option.key} type="button" aria-pressed={selected === index}
        onClick={() => setSelected(index)}
        className={`min-h-11 rounded-lg px-3 py-2 text-xs font-medium transition-colors md:px-4 md:text-sm ${selected === index ? "bg-primary/10 text-primary" : "text-text-secondary hover:bg-muted"}`}>
        {option.title}
      </button>)}
    </div>
    <div className="relative aspect-[8/5] overflow-hidden bg-background">
      {(["light", "dark"] as const).map(theme => <Image key={`${view.key}-${theme}`}
        src={screenshots[view.key][theme]} alt={view.alt} placeholder="blur"
        sizes="(min-width: 1264px) 1200px, 96vw"
        className={`h-auto w-full ${theme === "light" ? "dark:hidden" : "hidden dark:block"}`} />)}
    </div>
  </div>;
}
