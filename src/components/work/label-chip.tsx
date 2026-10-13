/** A task label in its preset colour (migration 053); see src/lib/work/label-presets.ts. */
export function LabelChip({ name, color, className = "" }: { name: string; color: string; className?: string }) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}
      style={{ borderColor: `${color}66`, backgroundColor: `${color}1a` }}
    >
      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="truncate">{name}</span>
    </span>
  );
}
