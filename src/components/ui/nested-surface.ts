/** Coordinate nested surfaces even when Radix packages use separate layer stacks. */
const closers = new WeakMap<HTMLElement, () => void>();

export function registerNestedSurface(element: HTMLElement, close: () => void) {
  closers.set(element, close);
  return () => { if (closers.get(element) === close) closers.delete(element); };
}

export function dismissNestedSurface(event: KeyboardEvent) {
  if (event.defaultPrevented || event.key !== "Escape" || !(event.target instanceof Element)) return;
  const surface = event.target.closest<HTMLElement>('[data-slot="popover-content"][data-state="open"]');
  const close = surface && closers.get(surface);
  if (!close) return;
  event.preventDefault();
  close();
}
