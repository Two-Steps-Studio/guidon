import { Badge } from "@/components/ui/badge";

/** One release label shared by the public site and signed-in application. */
export function BetaBadge() {
  return <Badge variant="outline" data-beta-badge className="border-primary/30 bg-primary/10 text-primary tracking-wide">BETA</Badge>;
}
