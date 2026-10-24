"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { setProjectPinned } from "@/app/actions/pinned-projects";
import type { PinnedProject } from "@/lib/data/pinned-projects";

interface PinnedProjectsValue {
  projects: PinnedProject[];
  isPinned: (projectId: string) => boolean;
  toggle: (project: PinnedProject) => Promise<void>;
}

const PinnedProjectsContext = createContext<PinnedProjectsValue | null>(null);

export function PinnedProjectsProvider({ initial, children }: { initial: PinnedProject[]; children: React.ReactNode }) {
  const t = useTranslations("projects.list");
  const [projects, setProjects] = useState(initial);

  const isPinned = useCallback((projectId: string) => projects.some((project) => project.id === projectId), [projects]);

  const toggle = useCallback(
    async (project: PinnedProject) => {
      const pin = !projects.some((item) => item.id === project.id);
      const before = projects;
      const optimistic = pin ? [...projects, project] : projects.filter((item) => item.id !== project.id);
      setProjects(optimistic);

      const result = await setProjectPinned(project.id, pin);
      if (result.error) {
        setProjects(before);
        toast.error(result.error === "too_many" ? t("pinLimit") : t("pinFailed"));
        return;
      }

      const byId = new Map(optimistic.map((item) => [item.id, item]));
      setProjects(result.pinned.flatMap((id) => {
        const item = byId.get(id);
        return item ? [item] : [];
      }));
    },
    [projects, t]
  );

  const value = useMemo(() => ({ projects, isPinned, toggle }), [projects, isPinned, toggle]);
  return <PinnedProjectsContext.Provider value={value}>{children}</PinnedProjectsContext.Provider>;
}

/** null outside the app shell. */
export function usePinnedProjects(): PinnedProjectsValue | null {
  return useContext(PinnedProjectsContext);
}
