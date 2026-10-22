/** Right-button panning leaves primary-button card dragging untouched. */
export function attachBoardPan(board: HTMLElement) {
  let active: { id: number; x: number; y: number; column: HTMLElement | null } | null = null;
  let previousCursor = "";
  const finish = () => {
    if (!active) return;
    const id = active.id;
    active = null;
    board.style.cursor = previousCursor;
    if (board.hasPointerCapture(id)) board.releasePointerCapture(id);
  };
  const down = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" || event.button !== 2 || active) return;
    const target = event.target as HTMLElement;
    const column = target.closest("[data-column-status]")?.querySelector<HTMLElement>("[data-column-scroll]") ?? null;
    active = { id: event.pointerId, x: event.clientX, y: event.clientY, column };
    previousCursor = board.style.cursor;
    board.style.cursor = "grabbing";
    board.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const move = (event: PointerEvent) => {
    if (!active || active.id !== event.pointerId) return;
    if (!(event.buttons & 2)) return finish();
    board.scrollLeft -= event.clientX - active.x;
    if (active.column) active.column.scrollTop -= event.clientY - active.y;
    active.x = event.clientX;
    active.y = event.clientY;
    event.preventDefault();
  };
  const up = (event: PointerEvent) => {
    if (event.pointerId === active?.id) finish();
  };
  const context = (event: Event) => event.preventDefault();
  board.addEventListener("pointerdown", down);
  board.addEventListener("pointermove", move);
  board.addEventListener("pointerup", up);
  board.addEventListener("pointercancel", up);
  board.addEventListener("lostpointercapture", up);
  board.addEventListener("contextmenu", context);
  window.addEventListener("blur", finish);
  return () => {
    finish();
    board.removeEventListener("pointerdown", down);
    board.removeEventListener("pointermove", move);
    board.removeEventListener("pointerup", up);
    board.removeEventListener("pointercancel", up);
    board.removeEventListener("lostpointercapture", up);
    board.removeEventListener("contextmenu", context);
    window.removeEventListener("blur", finish);
  };
}
