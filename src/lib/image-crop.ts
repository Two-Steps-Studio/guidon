/** One source rectangle for both the visible square and the exported pixels. */
export function squareCrop(width: number, height: number, zoom: number, x: number, y: number) {
  if (![width, height, zoom, x, y].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const side = Math.min(width, height) / clamp(zoom, 1, 3);
  const sx = (width - side) * (clamp(x, -100, 100) + 100) / 200;
  const sy = (height - side) * (clamp(y, -100, 100) + 100) / 200;
  return {
    sx, sy, side,
    style: {
      width: `${width / side * 100}%`,
      height: `${height / side * 100}%`,
      left: `${-sx / side * 100}%`,
      top: `${-sy / side * 100}%`,
    },
  };
}
