import { cn } from "@/lib/utils";
import { Gido, type GidoMood } from "./gido";

/**
 * Gido with a speech bubble, for the pages that walk a person through
 * something before the app shell exists (sign-in, sign-up, password reset,
 * onboarding). Decorative character, readable message: the bubble text is
 * announced politely when it changes (a new onboarding step).
 */
export function GidoGuide({ message, mood = "awake", className }: { message: string; mood?: GidoMood; className?: string }) {
  return (
    <div className={cn("flex w-full max-w-md items-end gap-3", className)}>
      <Gido mood={mood} className="size-16 shrink-0 drop-shadow-sm" />
      <p
        aria-live="polite"
        className="relative mb-3 rounded-xl border border-border bg-background px-3 py-2 text-sm leading-relaxed text-muted-foreground shadow-sm before:absolute before:-left-1.5 before:bottom-3 before:size-3 before:rotate-45 before:border-b before:border-l before:border-border before:bg-background"
      >
        {message}
      </p>
    </div>
  );
}
