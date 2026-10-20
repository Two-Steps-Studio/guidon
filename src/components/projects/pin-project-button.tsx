"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Pin } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { setProjectPinned } from "@/app/actions/pinned-projects";

/**
 * Pin a project to the top of the project list and the dashboard
 * (migration 065, up to 3). Sits inside a card that is a link, so it stops
 * the click from opening the project.
 */
export function PinProjectButton({ projectId, pinned }: { projectId: string; pinned: boolean }) {
  const t = useTranslations("projects.list");
  const router = useRouter();
  const [optimistic, setOptimistic] = useState(pinned);
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      aria-pressed={optimistic}
      aria-label={optimistic ? t("unpin") : t("pin")}
      title={optimistic ? t("unpin") : t("pin")}
      disabled={pending}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const next = !optimistic;
        setOptimistic(next);
        startTransition(async () => {
          const result = await setProjectPinned(projectId, next);
          if (result.error) {
            setOptimistic(!next);
            toast.error(result.error === "too_many" ? t("pinLimit") : t("pinFailed"));
            return;
          }
          router.refresh();
        });
      }}
      className={cn(
        "ml-auto shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        optimistic ? "text-primary" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-100"
      )}
    >
      <Pin className={cn("h-4 w-4", optimistic && "fill-current")} />
    </button>
  );
}
