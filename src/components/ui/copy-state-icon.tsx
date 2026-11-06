import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

const ICON = "col-start-1 row-start-1 transition-[opacity,scale,filter] duration-150 ease-(--ease-out) motion-reduce:transition-none";
const HIDDEN = "scale-50 opacity-0 blur-[2px]";

/** Copy -> check as a crossfade (opacity, scale, blur) instead of a hard swap. */
export function CopyStateIcon({ copied, className }: { copied: boolean; className?: string }) {
  return (
    <span aria-hidden="true" className="inline-grid">
      <Copy className={cn(ICON, className, copied && HIDDEN)} />
      <Check className={cn(ICON, className, !copied && HIDDEN)} />
    </span>
  );
}
