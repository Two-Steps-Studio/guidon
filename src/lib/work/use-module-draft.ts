"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { changeModuleDraft, moveModuleDraft, type DraftSnapshot, type ModuleDraft } from "./module-draft";

export type DraftSaveError = "permission" | "invalid" | "conflict" | "saveFailed";
export type DraftSaver = (state: ModuleDraft, revision: number) => Promise<{ error: DraftSaveError } | { error: null; revision: number }>;
export function useModuleDraft(initial: { state: ModuleDraft; revision: number }, save: DraftSaver) {
  const [state, setState] = useState(initial.state);
  const [revision, setRevision] = useState(initial.revision);
  const [saved, setSaved] = useState(() => JSON.stringify(initial.state));
  const [saveState, setSaveState] = useState<DraftSaveError | "saved" | "saving">("saved");
  const editGroup = useRef({ name: "", at: 0 });
  const serialized = JSON.stringify(state);
  const dirty = serialized !== saved;
  useEffect(() => {
    if (!dirty || saveState === "saving" || saveState === "conflict" || saveState === "saveFailed" || saveState === "permission" || saveState === "invalid") return;
    const timer = setTimeout(() => {
      setSaveState("saving");
      void save(state, revision).then((result) => {
        if (result.error !== null) { setSaveState(result.error); return; }
        setSaved(serialized); setRevision(result.revision); setSaveState("saved");
      }).catch(() => setSaveState("saveFailed"));
    }, 800);
    return () => clearTimeout(timer);
  }, [dirty, state, serialized, revision, save, saveState]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const change = useCallback((snapshot: DraftSnapshot, group = "") => {
    const now = Date.now();
    const coalesce = !!group && editGroup.current.name === group && now - editGroup.current.at < 1200;
    editGroup.current = { name: group, at: now };
    setState((previous) => changeModuleDraft(previous, snapshot, coalesce));
  }, []);
  const move = useCallback((direction: "undo" | "redo") => {
    editGroup.current.name = "";
    setState((previous) => moveModuleDraft(previous, direction));
  }, []);
  const restore = useCallback((index: number) => {
    editGroup.current.name = "";
    setState((previous) => {
      let next = previous;
      const steps = index - previous.past.length;
      for (let i = 0; i < Math.abs(steps); i++) next = moveModuleDraft(next, steps < 0 ? "undo" : "redo");
      return next;
    });
  }, []);
  const displayedSaveState: DraftSaveError | "saved" | "saving" | "unsaved" = dirty && saveState === "saved" ? "unsaved" : saveState;
  return { state, revision, dirty, saveState: displayedSaveState, change, move, restore, retry: () => setSaveState("saved") };
}
