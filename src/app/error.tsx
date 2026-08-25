"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * Root error boundary - catches anything thrown while rendering a Server
 * Component or Server Action result, most importantly a Supabase query's
 * `error` that a page previously would have silently treated as "no data"
 * (see the pages that now `throw` on a query error instead of defaulting
 * to an empty array). Without this file Next falls back to its own
 * unstyled default error page.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <Card className="max-w-md border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <h3 className="mb-2 text-lg font-semibold">Something went wrong</h3>
          <p className="mb-4 max-w-md text-muted-foreground">
            {error.message || "An unexpected error occurred while loading this page."}
          </p>
          <Button onClick={reset}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
