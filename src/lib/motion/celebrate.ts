/**
 * A short confetti burst for finishing a task - the biggest moment on the
 * board, so the one place it gets a little delight. Kept small on purpose
 * (people finish several tasks a day): ~28 pieces from the card, gone in
 * under a second, drawn on a throwaway canvas with requestAnimationFrame
 * (positions depend on where the card is, so it can't be a fixed CSS
 * animation). Skipped entirely for prefers-reduced-motion; on touch devices
 * a single 12ms vibration stands in for a haptic tap.
 */

const COLORS = ["#1d4fd8", "#4d8dff", "#059669", "#34d399", "#f59e0b"];
const PIECES = 28;
const DURATION_MS = 900;

export function celebrate(origin: { x: number; y: number }): void {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  if (window.matchMedia("(pointer: coarse)").matches) navigator.vibrate?.(12);

  const canvas = document.createElement("canvas");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    width: "100vw",
    height: "100vh",
    pointerEvents: "none",
    zIndex: "100",
  });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }
  ctx.scale(dpr, dpr);

  const pieces = Array.from({ length: PIECES }, () => {
    // A fan upwards: -150°..-30°, so the burst reads as coming out of the card.
    const angle = (-150 + Math.random() * 120) * (Math.PI / 180);
    const speed = 5 + Math.random() * 5;
    return {
      x: origin.x,
      y: origin.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 4 + Math.random() * 4,
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.4,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    };
  });

  const start = performance.now();
  let last = start;
  const frame = (now: number) => {
    const elapsed = now - start;
    // Frame-rate independent: velocities are per 16.7ms frame.
    const step = Math.min((now - last) / 16.7, 3);
    last = now;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    // Fade over the last third.
    ctx.globalAlpha = Math.max(0, Math.min(1, (DURATION_MS - elapsed) / (DURATION_MS / 3)));
    for (const piece of pieces) {
      piece.vy += 0.35 * step;
      piece.vx *= Math.pow(0.98, step);
      piece.x += piece.vx * step;
      piece.y += piece.vy * step;
      piece.rotation += piece.spin * step;
      ctx.save();
      ctx.translate(piece.x, piece.y);
      ctx.rotate(piece.rotation);
      ctx.fillStyle = piece.color;
      ctx.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2);
      ctx.restore();
    }
    if (elapsed < DURATION_MS) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

function findCard(taskId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(taskId)}"]`);
}

/** The card's top centre, if that point is on screen and not clipped by a scroll container (the board scrolls sideways). */
function visibleTop(card: HTMLElement | null): { x: number; y: number } | null {
  if (!card) return null;
  const rect = card.getBoundingClientRect();
  const point = { x: rect.left + rect.width / 2, y: rect.top + 8 };
  if (point.x < 0 || point.y < 0 || point.x > window.innerWidth || point.y > window.innerHeight) return null;
  for (let parent = card.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    if (style.overflowX === "visible" && style.overflowY === "visible") continue;
    const box = parent.getBoundingClientRect();
    if (point.x < box.left || point.x > box.right || point.y < box.top || point.y > box.bottom) return null;
  }
  return point;
}

/**
 * Bursts from the task's card in its new column; if that spot isn't on
 * screen (Done scrolled out of view, a move from the card menu), from where
 * the card was - where the person is looking. Call it before the move
 * renders.
 */
export function celebrateTask(taskId: string): void {
  if (typeof document === "undefined") return;
  const before = visibleTop(findCard(taskId));
  // After the optimistic move has rendered the card in its new column.
  requestAnimationFrame(() => {
    const origin = visibleTop(findCard(taskId)) ?? before;
    if (origin) celebrate(origin);
  });
}
