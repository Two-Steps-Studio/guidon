import { cn } from "@/lib/utils";

/** The "G" shield from the Guidon wordmark, for places too narrow for the full logo (collapsed sidebar). */
export function GuidonMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="140 380 255 262"
      role="img"
      aria-label="Guidon"
      className={cn("fill-current", className)}
    >
      <path d="M148 388h238v80h-41v-40H190v115l80 43 75-38v-25l-120-37h161v87l-116 61-122-68z" />
    </svg>
  );
}
