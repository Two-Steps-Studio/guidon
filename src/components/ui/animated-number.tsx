import { cn } from "@/lib/utils";

/**
 * A count whose digits roll to the new value instead of jumping - for small
 * numbers that change because of something the user just did (a board
 * column's count after a drag, the unread badge). Each digit is a column of
 * 0-9 moved with `transform` (GPU, no layout), 200ms strong ease-out;
 * transitions rather than keyframes, so a value that changes twice in a row
 * retargets mid-roll. No movement on the first render - a CSS transition
 * only runs on a change. The global prefers-reduced-motion rule
 * (globals.css) turns the roll into an instant swap.
 *
 * Screen readers get the plain number; the digit columns are hidden from them.
 */
export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const text = String(Math.max(0, Math.trunc(value)));
  return (
    <span className={cn("inline-flex tabular-nums", className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden className="inline-flex overflow-hidden" style={{ height: "1lh" }}>
        {text.split("").map((char, index) => (
          // Keyed from the right, so the ones digit stays the same element
          // when the number gains a digit (9 -> 10 rolls the 9 to 0).
          <span key={text.length - index} className="relative inline-block w-[1ch]">
            <span
              className="absolute left-0 top-0 flex flex-col transition-transform duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]"
              style={{ transform: `translateY(-${Number(char) * 10}%)` }}
            >
              {DIGITS.map((digit) => (
                <span key={digit} className="block h-[1lh] leading-[inherit]">
                  {digit}
                </span>
              ))}
            </span>
            {/* Sizes the column to one digit's width and line height. */}
            <span className="invisible">0</span>
          </span>
        ))}
      </span>
    </span>
  );
}

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
