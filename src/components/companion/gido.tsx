import { cn } from "@/lib/utils";

export type GidoMood = "awake" | "sleepy" | "happy";

/** Petals around the body (from the owner's drawing): cx, cy, r in a 400x400 box. */
const PETALS: readonly [number, number, number][] = [
  [180, 47, 33],
  [287, 60, 45],
  [345, 170, 39],
  [329, 279, 36],
  [209, 344, 35],
  [93, 309, 34],
  [46, 208, 35],
  [86, 99, 34],
];

/**
 * Gido, Guidon's companion. Pure SVG: the body floats, the petals drift
 * around it and the eyes blink (globals.css `.gido-*`; reduced motion stops
 * all of it). Decorative - the button that holds it carries the name.
 */
export function Gido({ mood = "awake", className }: { mood?: GidoMood; className?: string }) {
  return (
    <svg viewBox="0 0 400 400" aria-hidden="true" className={cn("gido", className)} data-mood={mood}>
      <g className="gido-float">
        <g className="gido-petals">
          {PETALS.map(([cx, cy, r]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} className="gido-skin" />
          ))}
        </g>
        <circle cx={200} cy={195} r={103} className="gido-skin" />
        {mood === "sleepy" && (
          <g className="gido-eye-color">
            <ellipse cx={159} cy={200} rx={29} ry={5} transform="rotate(-5 159 200)" />
            <ellipse cx={238} cy={193} rx={29} ry={5} transform="rotate(-5 238 193)" />
          </g>
        )}
        {mood === "awake" && (
          <g className="gido-eye-color gido-blink">
            <ellipse cx={162} cy={190} rx={11} ry={17} />
            <ellipse cx={238} cy={186} rx={11} ry={17} />
          </g>
        )}
        {mood === "happy" && (
          <g className="gido-eye-stroke" fill="none" strokeWidth={9} strokeLinecap="round">
            <path d="M144 196 Q162 176 180 196" />
            <path d="M220 192 Q238 172 256 192" />
          </g>
        )}
      </g>
    </svg>
  );
}
