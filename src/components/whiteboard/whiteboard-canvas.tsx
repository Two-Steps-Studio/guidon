"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  Connection,
  ConnectionMode,
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
  BackgroundVariant,
} from "reactflow";
import "reactflow/dist/style.css";
import { useDebounce } from "@/hooks/use-debounce";
import { TaskProposalModal } from "./task-proposal-modal";
import { WhiteboardToolbar } from "./whiteboard-toolbar";
import {
  generateTaskProposals,
  getBoardAction,
  getElementsAction,
  getTasksForBoardAction,
  upsertElementAction,
  getEdgesAction,
  upsertEdgeAction,
  deleteEdgesAction,
  deleteElementsAction,
} from "@/app/projects/[id]/whiteboard/actions";
import { toast } from "sonner";

interface WhiteboardCanvasProps {
  projectId: string;
}

interface StickyData {
  content?: string;
  color?: string;
  onChange?: (id: string, text: string) => void;
}

interface ShapeData extends StickyData {
  shape?: "rectangle" | "circle";
}

const STICKY_COLORS = ["#fef3c7", "#fde68a", "#bbf7d0", "#bfdbfe", "#fbcfe8", "#e5e7eb"];

const StickyNode = ({ data, id }: { data: StickyData; id: string }) => {
  const handleTextChange = (e: React.FormEvent<HTMLDivElement>) => {
    const newText = e.currentTarget.innerText;
    if (data.onChange) {
      data.onChange(id, newText);
    }
  };

  return (
    <div
      className="p-3 rounded-sm shadow-sm border border-border min-w-[150px] min-h-[100px] text-foreground"
      style={{ backgroundColor: data.color }}
    >
      <div
        className="text-sm whitespace-pre-wrap outline-none"
        contentEditable
        suppressContentEditableWarning
        onBlur={handleTextChange}
      >
        {data.content}
      </div>
    </div>
  );
};

const ShapeNode = ({ data, id }: { data: ShapeData; id: string }) => {
  return (
    <div
      className={`p-3 rounded-sm shadow-sm border border-border min-w-[150px] min-h-[100px] text-foreground flex items-center justify-center text-center ${
        data.shape === "circle" ? "rounded-full" : "rounded-sm"
      }`}
      style={{ backgroundColor: data.color }}
    >
      <div
        className="text-sm whitespace-pre-wrap outline-none"
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => data.onChange && data.onChange(id, e.currentTarget.innerText)}
      >
        {data.content}
      </div>
    </div>
  );
};

/** Kółka statusów - barwy zgodne z przyzwyczajeniami z tablicy zadań. */
const STATUS_DOT_CLASSES: Record<string, string> = {
  backlog: "bg-zinc-400",
  todo: "bg-sky-400",
  in_progress: "bg-blue-500",
  ai_working: "bg-violet-500",
  review: "bg-amber-400",
  done: "bg-emerald-500",
};

/**
 * Karta zadania na tablicy: tylko do odczytu, klik otwiera zadanie.
 * Zadania nie są elementami tablicy (nie zapisujemy ich do bazy) - są
 * nakładką na tą samą kanwę, by można je łączyć z notatkami i kształtami.
 */
const TaskNode = ({ data }: { data: any }) => {
  const router = useRouter();
  const t = useTranslations("whiteboard");

  return (
    <button
      type="button"
      onClick={() => router.push(`/projects/${data.projectId}/work?openTask=${data.taskId}`)}
      className="w-56 cursor-pointer rounded-lg border border-border bg-background text-left shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT_CLASSES[data.status] ?? "bg-muted-foreground"}`}
          aria-hidden
        />
        {data.done && <span className="text-xs text-emerald-600 dark:text-emerald-400">✓</span>}
        <span className="text-xs text-muted-foreground">{t("taskChip")}</span>
      </div>
      <div className="px-3 py-2 text-sm font-medium leading-snug line-clamp-3">{data.title}</div>
    </button>
  );
};

const nodeTypes = {
  sticky: StickyNode,
  shape: ShapeNode,
  task: TaskNode,
};

/** Pozycje zadań dodanych na tablicę - zapamiętane na czas sesji (toggle off/on). */
interface TaskSnapshot {
  id: string;
  title: string;
  status: string;
  priority: string;
  done: boolean;
  position: { x: number; y: number };
}

function WhiteboardFlow({ projectId }: WhiteboardCanvasProps) {
  const { screenToFlowPosition } = useReactFlow();
  const t = useTranslations("whiteboard");

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [tasksVisible, setTasksVisible] = useState(false);
  const [taskSnapshot, setTaskSnapshot] = useState<TaskSnapshot[]>([]);
  const [lastSelected, setLastSelected] = useState<Node[]>([]);
  const [aiProposals, setAiProposals] = useState<{ prose: string; proposals: any[] } | null>(null);

  // Referencje na dane do zapisu - porównanie JSON-em, nie referencją:
  // listener keydown i rebuild palety nie powinny uruchamiać zapisu.
  const lastSavedNodesJsonRef = useRef<string>("");
  const lastSavedEdgesJsonRef = useRef<string>("");

  const debouncedNodes = useDebounce(nodes, 1000);
  const debouncedEdges = useDebounce(edges, 1000);

  useEffect(() => {
    let cancelled = false;
    async function loadBoard() {
      try {
        // 1. Realny board (UUID) - albo utworzenie „Głównej tablicy".
        const board = (await getBoardAction(projectId)) as { boardId: string; name: string };
        if (cancelled) return;
        setBoardId(board.boardId);

        const [elementsResult, edgesResult] = await Promise.all([
          getElementsAction(projectId, board.boardId),
          getEdgesAction(projectId, board.boardId),
        ]);
        if (cancelled) return;

        const initialNodes = (elementsResult.data ?? []).map((el: any) => ({
          id: el.id,
          type: el.type,
          position: { x: el.x, y: el.y },
          data: {
            content: el.content?.text,
            shape: el.content?.shape,
            color: el.content?.color,
            onChange: (id: string, text: string) => {
              setNodes((nds) =>
                nds.map((node) => (node.id === id ? { ...node, data: { ...node.data, content: text } } : node))
              );
            },
          },
        }));

        const initialEdges = (edgesResult.data ?? []).map((e: any) => ({
          id: e.id,
          source: e.source_id,
          target: e.target_id,
          label: e.label,
          type: e.type ?? "default",
        }));

        setNodes(initialNodes);
        setEdges(initialEdges);
        lastSavedNodesJsonRef.current = JSON.stringify(boardNodesJson(initialNodes));
        lastSavedEdgesJsonRef.current = JSON.stringify(persistableEdgesJson(initialEdges));
      } catch (e) {
        if (!cancelled) {
          console.error("Failed to load the board", e);
          toast.error(t("loadError"));
        }
      }
    }
    loadBoard();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  /** Elementy tablicy przeznaczone do zapisu - karty zadań (type "task") z nich wykluczone. */
  function boardNodesJson(list: Node[]) {
    return list
      .filter((node) => node.type !== "task")
      .map((node) => ({
        id: node.id,
        type: node.type,
        position: { x: node.position.x, y: node.position.y },
        content: { text: (node.data as StickyData).content, shape: (node.data as ShapeData).shape, color: (node.data as StickyData).color },
      }));
  }

  /** Krawędzie z kartami zadań są tylko lokalne (elementy tablicy są nimi FK). */
  function persistableEdgesJson(list: Edge[]) {
    return list
      .filter((edge) => !edge.source.startsWith("task:") && !edge.target.startsWith("task:"))
      .map((edge) => ({
        id: edge.id,
        board_id: boardId,
        source_id: edge.source,
        target_id: edge.target,
        type: edge.type ?? "default",
        label: typeof edge.label === "string" ? edge.label : (edge.label as any)?.value ?? null,
      }));
  }

  useEffect(() => {
    const snapshot = JSON.stringify(boardNodesJson(debouncedNodes));
    if (snapshot === lastSavedNodesJsonRef.current) return;

    async function saveElements() {
      const elements = boardNodesJson(debouncedNodes);
      try {
        for (const el of elements) {
          await upsertElementAction(projectId, { ...el, board_id: boardId });
        }
        lastSavedNodesJsonRef.current = snapshot;
      } catch (e) {
        console.error("Failed to save elements", e);
        toast.error(t("saveError"));
      }
    }
    saveElements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedNodes, projectId]);

  useEffect(() => {
    const snapshot = JSON.stringify(persistableEdgesJson(debouncedEdges));
    if (snapshot === lastSavedEdgesJsonRef.current) return;

    async function saveEdges() {
      try {
        for (const edge of persistableEdgesJson(debouncedEdges)) {
          await upsertEdgeAction(projectId, edge);
        }
        lastSavedEdgesJsonRef.current = snapshot;
      } catch (e) {
        console.error("Failed to save edges", e);
        toast.error(t("saveError"));
      }
    }
    saveEdges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedEdges, projectId]);

  /** Tworzenie elementu w konkretnym miejscu kanwy (id po stronie klienta). */
  const createNode = useCallback(
    (type: "sticky" | "shape", shape?: "rectangle" | "circle", position?: { x: number; y: number }) => {
      const newPosition =
        position ??
        screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

      const newNode: Node = {
        id: crypto.randomUUID(),
        type,
        position: newPosition,
        data: {
          content: "",
          color: type === "sticky" ? "#fef3c7" : "#e2e8f0",
          shape: shape ?? "rectangle",
          onChange: (id: string, text: string) => {
            setNodes((nds) => nds.map((node) => (node.id === id ? { ...node, data: { ...node.data, content: text } } : node)));
          },
        },
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [screenToFlowPosition, setNodes]
  );

  /**
   * Podwójne kliknięcie po pustym tle tworzy karteczkę bezpośrednio pod
   * kursorem - tworzenie nie wymaga sięgania do paska narzędzi i działa
   * niezależnie od tego, jakim trybem nawigujemy po tablicy.
   */
  const handleDoubleClick = (event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    if (
      target.closest(".react-flow__node") ||
      target.closest(".react-flow__edge") ||
      target.closest(".react-flow__controls") ||
      target.closest(".react-flow__minimap") ||
      target.closest("[data-tour-toolbar]")
    ) {
      return;
    }
    event.preventDefault();
    createNode("sticky", undefined, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  };

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) =>
      addEdge({ ...params, id: `edge-${crypto.randomUUID()}`, type: "default" } as Edge, eds)
    );
  }, [setEdges]);

  const onSelectionChange = useCallback((params: { nodes: Node[] }) => {
    setLastSelected(params.nodes);
  }, []);

  /** Usuwa zaznaczone elementy (karty zadań zostają - to nie elementy tablicy). */
  const deleteSelected = useCallback(async () => {
    const deletable = lastSelected.filter((node) => node.type !== "task");
    if (deletable.length === 0) return;
    const deletableIds = new Set(deletable.map((node) => node.id));

    const incidentEdges = edges.filter(
      (edge) => deletableIds.has(edge.source) || deletableIds.has(edge.target)
    );

    setNodes((nds) => nds.filter((node) => !deletableIds.has(node.id)));
    setEdges((eds) => eds.filter((edge) => !incidentEdges.includes(edge)));

    try {
      if (incidentEdges.length > 0) {
        await deleteEdgesAction(
          projectId,
          incidentEdges
            .filter((edge) => !edge.source.startsWith("task:") && !edge.target.startsWith("task:"))
            .map((edge) => edge.id)
        );
      }
      await deleteElementsAction(projectId, [...deletableIds]);
    } catch (e) {
      console.error("Failed to delete nodes", e);
      toast.error(t("saveError"));
    }
    setLastSelected([]);
  }, [lastSelected, edges, projectId, setNodes, setEdges, t]);

  /** Delete/Backspace usuwa zaznaczone elementy (bez kart zadań). */
  useEffect(() => {
    if (lastSelected.length === 0) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const target = event.target as HTMLElement;
      if (target.isContentEditable || ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      event.preventDefault();
      void deleteSelected();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lastSelected, deleteSelected]);

  const toggleTasks = useCallback(async () => {
    if (tasksVisible) {
      // Zapamiętaj pozycje kart zadań na czas sesji i zdejmij je z kanwy.
      const accessedIds = nodes.filter((n) => n.type === "task").map((n) => n.id);
      const positions = new Map(
        nodes.filter((n) => n.type === "task").map((n) => [n.id, n.position])
      );
      setNodes((nds) => nds.filter((n) => n.type !== "task"));
      setEdges((eds) => eds.filter((e) => !accessedIds.includes(e.source) && !accessedIds.includes(e.target)));
      setTaskSnapshot((snap) => snap.map((s) => ({ ...s, position: positions.get(`task:${s.id}`) ?? s.position })));
      setTasksVisible(false);
      return;
    }

    try {
      const tasks = (await getTasksForBoardAction(projectId)) as any[];
      const merged: TaskSnapshot[] = tasks.map((task, index) => {
        const previous = taskSnapshot.find((entry) => entry.id === task.id);
        return {
          id: task.id,
          title: task.title,
          status: task.status,
          priority: task.priority,
          done: Boolean(task.is_done),
          position: previous?.position ?? {
            x: 900 + (index % 4) * 260,
            y: 80 + Math.floor(index / 4) * 200,
          },
        };
      });
      setTaskSnapshot(merged);
      const taskNodes = merged.map((snapshot) => ({
        id: `task:${snapshot.id}`,
        type: "task",
        position: snapshot.position,
        data: {
          taskId: snapshot.id,
          title: snapshot.title,
          status: snapshot.status,
          priority: snapshot.priority,
          done: snapshot.done,
          projectId,
        },
      })) as Node[];
      setNodes((nds) => [...nds.filter((n) => n.type !== "task"), ...taskNodes]);
      setTasksVisible(true);
    } catch (e) {
      console.error("Failed to load tasks", e);
      toast.error(t("loadError"));
    }
  }, [tasksVisible, taskSnapshot, nodes, projectId, setNodes, setEdges, t]);

  const changeSelectedColor = useCallback(
    (color: string) => {
      setNodes((nds) =>
        nds.map((node) =>
          lastSelected.some((s) => s.id === node.id) && node.type === "sticky"
            ? { ...node, data: { ...node.data, color }, selected: true }
            : node
        )
      );
    },
    [lastSelected, setNodes]
  );

  const handleAIConvert = async () => {
    const texts = lastSelected
      .filter((n) => n.type !== "task")
      .map((n) => (n.data as StickyData).content)
      .filter((text): text is string => Boolean(text));
    if (texts.length === 0) {
      toast.error(t("aiNeedsSelection"));
      return;
    }

    try {
      const result = await generateTaskProposals(projectId, texts);
      setAiProposals(result);
    } catch (e) {
      toast.error(t("aiError"));
    }
  };

  return (
    <div className="w-full h-full relative" onDoubleClick={handleDoubleClick}>
      {/* Podpowiedź: jak szybko dodać karteczkę. */}
      <div className="pointer-events-none absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-border bg-background/80 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
        {t("canvasHint")}
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        nodeTypes={nodeTypes}
        deleteKeyCode={null}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.25 }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls />
        <MiniMap pannable />
      </ReactFlow>

      <WhiteboardToolbar
        onAddSticky={() => createNode("sticky")}
        onAddRectangle={() => createNode("shape", "rectangle")}
        onAddCircle={() => createNode("shape", "circle")}
        tasksVisible={tasksVisible}
        onToggleTasks={toggleTasks}
        selectedNodes={lastSelected}
        onDeleteSelected={deleteSelected}
        onColorChange={changeSelectedColor}
        colors={STICKY_COLORS}
        onAIConvert={handleAIConvert}
      />

      {aiProposals && (
        <TaskProposalModal
          open={!!aiProposals}
          onClose={() => setAiProposals(null)}
          projectId={projectId}
          proposals={aiProposals.proposals}
          onConfirmed={() => setAiProposals(null)}
        />
      )}
    </div>
  );
}

export function WhiteboardCanvas({ projectId }: WhiteboardCanvasProps) {
  return (
    <ReactFlowProvider>
      <WhiteboardFlow projectId={projectId} />
    </ReactFlowProvider>
  );
}
