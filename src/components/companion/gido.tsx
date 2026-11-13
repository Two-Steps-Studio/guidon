import { cn } from "@/lib/utils";

export type GidoMood = "awake" | "sleepy" | "happy";

/** Small moons circling Gido: cx, cy, r in a 400x400 box (orbit centre 200,215). */
const MOONS: readonly [number, number, number][] = [
  [345, 150, 16],
  [62, 280, 12],
  [250, 368, 9],
];

/**
 * Gido, Guidon's companion: a round blue creature that carries a little
 * pennant (a guidon) on its antenna, with moons circling it. Pure SVG: it
 * floats, the moons orbit, the flag waves and the eyes blink (globals.css
 * `.gido-*`; reduced motion stops all of it). Decorative - the button that
 * holds it carries the name.
 */
export function Gido({ mood = "awake", className }: { mood?: GidoMood; className?: string }) {
  return (
    <svg viewBox="0 0 400 400" aria-hidden="true" className={cn("gido", className)} data-mood={mood}>
      <g className="gido-orbit">
        {MOONS.map(([cx, cy, r]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} className="gido-shade" />
        ))}
      </g>
      <g className="gido-float">
        <path d="M200 98 Q196 62 212 36" fill="none" strokeWidth={8} strokeLinecap="round" className="gido-stalk" />
        <path d="M210 24 L262 42 L210 60 Z" className="gido-flag" strokeLinejoin="round" />
        <ellipse cx={152} cy={342} rx={28} ry={15} className="gido-shade" />
        <ellipse cx={248} cy={342} rx={28} ry={15} className="gido-shade" />
        <path d="M200 95 C290 95 330 170 330 238 C330 308 275 345 200 345 C125 345 70 308 70 238 C70 170 110 95 200 95 Z" className="gido-skin" />
        <ellipse cx={200} cy={296} rx={80} ry={44} className="gido-belly" />
        <ellipse cx={126} cy={250} rx={18} ry={10} className="gido-cheek" />
        <ellipse cx={274} cy={250} rx={18} ry={10} className="gido-cheek" />
        {mood === "awake" && (
          <>
            <g className="gido-blink">
              <circle cx={160} cy={214} r={18} className="gido-eye-color" />
              <circle cx={240} cy={214} r={18} className="gido-eye-color" />
              <circle cx={166} cy={207} r={6} fill="#fff" />
              <circle cx={246} cy={207} r={6} fill="#fff" />
            </g>
            <path d="M186 246 Q200 258 214 246" fill="none" strokeWidth={7} strokeLinecap="round" className="gido-eye-stroke" />
          </>
        )}
        {mood === "sleepy" && (
          <g fill="none" strokeWidth={8} strokeLinecap="round" className="gido-eye-stroke">
            <path d="M141 214 Q160 230 179 214" />
            <path d="M221 214 Q240 230 259 214" />
            <path d="M193 250 L207 250" />
          </g>
        )}
        {mood === "happy" && (
          <>
            <g fill="none" strokeWidth={8} strokeLinecap="round" className="gido-eye-stroke">
              <path d="M141 222 Q160 198 179 222" />
              <path d="M221 222 Q240 198 259 222" />
            </g>
            <path d="M182 242 Q200 272 218 242 Z" strokeWidth={4} strokeLinejoin="round" className="gido-eye-color gido-eye-stroke" />
          </>
        )}
      </g>
    </svg>
  );
}
