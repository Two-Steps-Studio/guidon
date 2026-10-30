"use client";

import { createContext, useContext, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { Slot } from "@radix-ui/react-slot";

const SurfaceMotionContext = createContext<{ instant: boolean; setInstant: (instant: boolean) => void }>({ instant: false, setInstant: () => {} });

/** Keep the input method with the surface, including its portaled content. */
export function SurfaceMotionProvider({ children }: { children: ReactNode }) {
  const [instant, setInstant] = useState(false);
  const value = useMemo(() => ({ instant, setInstant }), [instant]);
  return <SurfaceMotionContext.Provider value={value}>{children}</SurfaceMotionContext.Provider>;
}

export function useSurfaceMotion() {
  return useContext(SurfaceMotionContext).instant ? "none" : "default";
}

/** Radix restores focus on a timer; an old close must not steal a new open. */
export function keepReopenedSurfaceFocus(event: Event) {
  const previous = event.currentTarget;
  if (!(previous instanceof HTMLElement) || !previous.id) return;
  const current = document.getElementById(previous.id);
  if (current && current !== previous) event.preventDefault();
}

/** Capture before Radix toggles open; Slot adds no focusable/DOM wrapper. */
export function SurfaceMotionTrigger({ children }: { children: ReactElement }) {
  const { setInstant } = useContext(SurfaceMotionContext);
  return (
    <Slot
      onKeyDownCapture={() => setInstant(true)}
      onPointerDownCapture={() => setInstant(false)}
      onPointerMoveCapture={event => {
        if (event.pointerType === "mouse" && (event.movementX || event.movementY)) setInstant(false);
      }}
      onClickCapture={event => { if (event.detail === 0) setInstant(true); }}
    >
      {children}
    </Slot>
  );
}
