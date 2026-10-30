"use client";

import { useRef } from "react";

export function AnimatedFaq({question, answer}: {question: string; answer: string}) {
  const pointer = useRef(false);
  const animation = useRef<Animation | null>(null);
  return (
    <details className="group py-4" onPointerDownCapture={() => { pointer.current = true; }}
      onKeyDownCapture={() => { pointer.current = false; animation.current?.cancel(); }}
      onToggle={event => {
        animation.current?.cancel();
        const paragraph = event.currentTarget.querySelector('p');
        if (!event.currentTarget.open || !pointer.current || !paragraph) return;
        const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
        animation.current = paragraph.animate([{opacity:reduce ? .7 : .3}, {opacity:1}], {
          duration:125, easing:getComputedStyle(paragraph).getPropertyValue('--ease-out').trim(),
        });
      }}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
        {question}<span aria-hidden className="text-muted-foreground group-open:rotate-45">+</span>
      </summary>
      <p className="pt-3 text-text-secondary">{answer}</p>
    </details>
  );
}
