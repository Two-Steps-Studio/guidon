"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { setTaskPinned } from "@/app/actions/pinned-tasks";
import type { PinnedTask } from "@/lib/data/pinned-tasks";

/**
 * The person's pinned tasks (migration 074), shared by the sidebar that
 * lists them and the task dialog that pins them - pinning shows up in the
 * sidebar at once, then the server's answer replaces the optimistic list.
 */
interface PinnedTasksValue {
  tasks: PinnedTask[];
  isPinned: (taskId: string) => boolean;
  toggle: (task: { id: string; title: string; project_id: string }) => Promise<void>;
}

const PinnedTasksContext = createContext<PinnedTasksValue | null>(null);

export function PinnedTasksProvider({ initial, children }: { initial: PinnedTask[]; children: React.ReactNode }) {
  const t = useTranslations("work");
  const [tasks, setTasks] = useState(initial);

  const isPinned = useCallback((taskId: string) => tasks.some((task) => task.id === taskId), [tasks]);

  const toggle = useCallback(
    async (task: { id: string; title: string; project_id: string }) => {
      const pin = !tasks.some((item) => item.id === task.id);
      const before = tasks;
      setTasks(pin ? [...tasks, { ...task, project_name: null, is_done: false }] : tasks.filter((item) => item.id !== task.id));
      const result = await setTaskPinned(task.id, pin);
      if (result.error) {
        setTasks(before);
        toast.error(result.error === "too_many" ? t("pinTooMany") : t("pinFailed"));
        return;
      }
      setTasks(result.pinned);
    },
    [tasks, t]
  );

  const value = useMemo(() => ({ tasks, isPinned, toggle }), [tasks, isPinned, toggle]);
  return <PinnedTasksContext.Provider value={value}>{children}</PinnedTasksContext.Provider>;
}

/** null outside the app shell (nothing to pin into). */
export function usePinnedTasks(): PinnedTasksValue | null {
  return useContext(PinnedTasksContext);
}
