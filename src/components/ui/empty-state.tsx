import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

/**
 * The icon-in-a-tinted-square treatment matches the feature cards on the
 * public landing page (src/app/page.tsx) — reused here so every empty state
 * in the app gets the same, more finished look instead of the plain muted
 * icon each of the 14 previous call sites hand-rolled slightly differently.
 */
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-12">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-6 w-6 text-primary" />
        </div>
        <h3 className="mb-2 text-lg font-semibold">{title}</h3>
        {description && (
          <p className="mb-4 max-w-md text-center text-muted-foreground">{description}</p>
        )}
        {action}
      </CardContent>
    </Card>
  );
}
