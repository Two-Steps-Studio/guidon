import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/**
 * A number whose digits roll up from 0 when it first appears. CSS only, so
 * it runs on the server-rendered HTML too; reduced motion shows it still
 * (globals.css). Screen readers get the plain number.
 */
export function RollingNumber({ value, className }: { value: number; className?: string }) {
  const text = String(value);
  return (
    <span className={cn("inline-flex tabular-nums", className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="inline-flex h-[1em] overflow-hidden leading-none">
        {[...text].map((char, index) =>
          /\d/.test(char) ? (
            <span key={index} className="inline-block h-[1em] overflow-hidden">
              <span
                className="number-roll block"
                style={{ "--digit": char, animationDelay: `${index * 40}ms` } as CSSProperties}
              >
                {DIGITS.map((digit) => (
                  <span key={digit} className="block h-[1em]">{digit}</span>
                ))}
              </span>
            </span>
          ) : (
            <span key={index}>{char}</span>
          )
        )}
      </span>
    </span>
  );
}
