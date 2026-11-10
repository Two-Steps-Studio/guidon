"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
  Handle,
  Position,
} from "reactflow";
import "reactflow/dist/style.css";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";
import type { TaskProposal } from "@/lib/ai/task-proposal-parser";
import type { EdgeInput, ElementInput, ShapeKind, WhiteboardElementType } from "@/lib/data/whiteboard";
import { TaskProposalModal } from "./task-proposal-modal";
import { WhiteboardToolbar } from "./whiteboard-toolbar";
import {
  deleteElementsAction,
  generateTaskProposals,
  getTasksForBoardAction,
  loadBoardAction,
  saveEdgesAction,
  saveElementsAction,
} from "@/app/projects/[id]/whiteboard/actions";

interface NoteData {
  content?: string;
  color?: string;
  shape?: ShapeKind;
  editable: boolean;
  onChange: (id: string, text: string) => void;
}

interface TaskData {
  taskId: string;
  title: string;
  status: string;
  done: boolean;
  projectId: string;
}

const STICKY_COLORS = ["#fef3c7", "#fde68a", "#bbf7d0", "#bfdbfe", "#fbcfe8", "#e5e7eb"];

/** The note's text plus the dots arrows start and end at (any dot connects to any, ConnectionMode.Loose). */
function EditableText({ id, data }: { id: string; data: NoteData }) {
  // The text is set here, not rendered as a React child: typing replaces the
  // browser's text nodes and React would then crash removing one it no longer owns.
  const textRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = textRef.current;
    if (el && document.activeElement !== el && el.innerText !== (data.content ?? "")) el.innerText = data.content ?? "";
  }, [data.content]);
  return (
    <>
      <Handle type="source" position={Position.Left} id="left" isConnectable={data.editable} />
      {/* nodrag/nopan: React Flow otherwise takes the pointer for dragging and
          the text never gets focus; min-h keeps an empty note clickable. */}
      <div
        ref={textRef}
        className={`min-h-[4.5rem] w-full text-sm whitespace-pre-wrap outline-none${data.editable ? " nodrag nopan cursor-text" : ""}`}
        contentEditable={data.editable}
        onBlur={(e) => data.onChange(id, e.currentTarget.innerText)}
      />
      <Handle type="source" position={Position.Right} id="right" isConnectable={data.editable} />
    </>
  );
}

const StickyNode = ({ data, id }: { data: NoteData; id: string }) => (
  <div
    className="p-3 rounded-sm shadow-sm border border-border min-w-[150px] min-h-[100px] text-foreground"
    style={{ backgroundColor: data.color }}
  >
    <EditableText id={id} data={data} />
  </div>
);

const ShapeNode = ({ data, id }: { data: NoteData; id: string }) => (
  <div
    className={`p-3 shadow-sm border border-border min-w-[150px] min-h-[100px] text-foreground flex items-center justify-center text-center ${
      data.shape === "circle" ? "rounded-full" : "rounded-sm"
    }`}
    style={{ backgroundColor: data.color }}
  >
    <EditableText id={id} data={data} />
  </div>
);

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
const TaskNode = ({ data }: { data: TaskData }) => {
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

const nodeTypes = { sticky: StickyNode, shape: ShapeNode, task: TaskNode };

const isTaskNode = (id: string) => id.startsWith("task:");

/** A board element as saved - task cards are an overlay and never saved. */
function toElementInput(node: Node<NoteData>): ElementInput {
  return {
    id: node.id,
    type: node.type as WhiteboardElementType,
    x: node.position.x,
    y: node.position.y,
    content: { text: node.data.content, shape: node.data.shape, color: node.data.color },
  };
}

function toEdgeInput(edge: Edge): EdgeInput {
  return { id: edge.id, source_id: edge.source, target_id: edge.target, label: typeof edge.label === "string" ? edge.label : null };
}

/** What changed since the last save, by id - a drag saves one note, not the whole board. */
function changedSince<T extends { id: string }>(items: T[], saved: Map<string, string>): T[] {
  return items.filter((item) => saved.get(item.id) !== JSON.stringify(item));
}

function remember<T extends { id: string }>(items: T[], saved: Map<string, string>) {
  for (const item of items) saved.set(item.id, JSON.stringify(item));
}

/** Pozycje zadań dodanych na tablicę - zapamiętane na czas sesji (toggle off/on). */
interface TaskSnapshot {
  id: string;
  title: string;
  status: string;
  done: boolean;
  position: { x: number; y: number };
}

function WhiteboardFlow({ projectId }: { projectId: string }) {
  const { screenToFlowPosition } = useReactFlow();
  const t = useTranslations("whiteboard");

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [board, setBoard] = useState<{ id: string; canEdit: boolean; ai: boolean } | null>(null);
  const [tasksVisible, setTasksVisible] = useState(false);
  const [taskSnapshot, setTaskSnapshot] = useState<TaskSnapshot[]>([]);
  const [lastSelected, setLastSelected] = useState<Node[]>([]);
  const [aiProposals, setAiProposals] = useState<TaskProposal[] | null>(null);

  // What the database holds, per id (JSON) - so a save sends only what changed.
  const savedElements = useRef(new Map<string, string>());
  const savedEdges = useRef(new Map<string, string>());

  const debouncedNodes = useDebounce(nodes, 1000);
  const debouncedEdges = useDebounce(edges, 1000);

  // Screen readers name each note by kind and text (an empty note had no name).
  const nodeLabel = useCallback(
    (type: string | undefined, text: string | undefined) => {
      const kind = t(type === "sticky" ? "stickyNode" : "shapeNode");
      return text ? `${kind}: ${text}` : kind;
    },
    [t]
  );

  const setText = useCallback(
    (id: string, text: string) =>
      setNodes((nds) =>
        nds.map((node) => (node.id === id ? { ...node, ariaLabel: nodeLabel(node.type, text), data: { ...node.data, content: text } } : node))
      ),
    [setNodes, nodeLabel]
  );

  useEffect(() => {
    let cancelled = false;
    loadBoardAction(projectId)
      .then((loaded) => {
        if (cancelled) return;
        const initialNodes: Node<NoteData>[] = loaded.elements.map((el) => ({
          id: el.id,
          type: el.type,
          position: { x: el.x, y: el.y },
          ariaLabel: nodeLabel(el.type, el.content?.text),
          data: { content: el.content?.text, shape: el.content?.shape, color: el.content?.color, editable: loaded.canEdit, onChange: setText },
        }));
        const initialEdges: Edge[] = loaded.edges.map((e) => ({
          id: e.id,
          source: e.source_id,
          target: e.target_id,
          // shortcut: dots aren't saved, so a saved arrow runs right-to-left; save them if arrows need other sides.
          sourceHandle: "right",
          targetHandle: "left",
          label: e.label ?? undefined,
          type: e.type,
        }));
        remember(initialNodes.map(toElementInput), savedElements.current);
        remember(initialEdges.map(toEdgeInput), savedEdges.current);
        setNodes(initialNodes);
        setEdges(initialEdges);
        setBoard({ id: loaded.boardId, canEdit: loaded.canEdit, ai: loaded.ai });
      })
      .catch((e) => {
        if (cancelled) return;
        console.error("Failed to load the board", e);
        toast.error(t("loadError"));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Saves what changed since the last save. Also called when the board is
  // left or hidden, so an edit made within the debounce window isn't lost.
  const persist = useCallback(
    (nodeList: Node<NoteData>[], edgeList: Edge[]) => {
      if (!board?.canEdit) return;
      const report = (e: unknown) => {
        console.error("Failed to save the board", e);
        toast.error(t("saveError"));
      };
      const elements = changedSince(nodeList.filter((node) => !isTaskNode(node.id)).map(toElementInput), savedElements.current);
      if (elements.length > 0) {
        remember(elements, savedElements.current);
        saveElementsAction(projectId, board.id, elements).catch((e) => {
          for (const element of elements) savedElements.current.delete(element.id);
          report(e);
        });
      }
      // Arrows to task cards stay local: tasks aren't board elements.
      const arrows = changedSince(
        edgeList.filter((edge) => !isTaskNode(edge.source) && !isTaskNode(edge.target)).map(toEdgeInput),
        savedEdges.current
      );
      if (arrows.length > 0) {
        remember(arrows, savedEdges.current);
        saveEdgesAction(projectId, board.id, arrows).catch((e) => {
          for (const arrow of arrows) savedEdges.current.delete(arrow.id);
          report(e);
        });
      }
    },
    [board, projectId, t]
  );

  useEffect(() => persist(debouncedNodes, debouncedEdges), [debouncedNodes, debouncedEdges, persist]);

  const latest = useRef({ nodes, edges });
  useEffect(() => {
    latest.current = { nodes, edges };
  }, [nodes, edges]);
  useEffect(() => {
    const flush = () => persist(latest.current.nodes, latest.current.edges);
    const onHide = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
  }, [persist]);

  /** Tworzenie elementu w konkretnym miejscu kanwy (id po stronie klienta). */
  const createNode = useCallback(
    (type: WhiteboardElementType, shape?: ShapeKind, position?: { x: number; y: number }) => {
      const newNode: Node<NoteData> = {
        id: crypto.randomUUID(),
        type,
        position: position ?? screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }),
        ariaLabel: nodeLabel(type, ""),
        data: {
          content: "",
          color: type === "sticky" ? STICKY_COLORS[0] : "#e2e8f0",
          shape: shape ?? "rectangle",
          editable: true,
          onChange: setText,
        },
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [screenToFlowPosition, setNodes, setText, nodeLabel]
  );

  /**
   * Podwójne kliknięcie po pustym tle tworzy karteczkę bezpośrednio pod
   * kursorem - tworzenie nie wymaga sięgania do paska narzędzi i działa
   * niezależnie od tego, jakim trybem nawigujemy po tablicy.
   */
  const handleDoubleClick = (event: React.MouseEvent) => {
    if (!board?.canEdit) return;
    const target = event.target as HTMLElement;
    if (target.closest(".react-flow__node, .react-flow__edge, .react-flow__controls, .react-flow__minimap, [data-tour-toolbar]")) {
      return;
    }
    event.preventDefault();
    createNode("sticky", undefined, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  };

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, id: crypto.randomUUID(), type: "default" }, eds)),
    [setEdges]
  );

  const onSelectionChange = useCallback((params: { nodes: Node[] }) => setLastSelected(params.nodes), []);

  /** Usuwa zaznaczone elementy z ich strzałkami (karty zadań zostają - to nie elementy tablicy). */
  const deleteSelected = useCallback(async () => {
    if (!board) return;
    const ids = lastSelected.filter((node) => !isTaskNode(node.id)).map((node) => node.id);
    if (ids.length === 0) return;
    const deleted = new Set(ids);

    setNodes((nds) => nds.filter((node) => !deleted.has(node.id)));
    setEdges((eds) => eds.filter((edge) => !deleted.has(edge.source) && !deleted.has(edge.target)));
    setLastSelected([]);

    try {
      // Saved arrows go with their notes (ON DELETE CASCADE).
      await deleteElementsAction(projectId, board.id, ids.filter((id) => savedElements.current.has(id)));
      for (const id of ids) savedElements.current.delete(id);
    } catch (e) {
      console.error("Failed to delete notes", e);
      toast.error(t("saveError"));
    }
  }, [board, lastSelected, projectId, setNodes, setEdges, t]);

  /** Delete/Backspace usuwa zaznaczone elementy (bez kart zadań). */
  useEffect(() => {
    if (lastSelected.length === 0 || !board?.canEdit) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const target = event.target as HTMLElement;
      if (target.isContentEditable || ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      event.preventDefault();
      void deleteSelected();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lastSelected, board, deleteSelected]);

  const toggleTasks = useCallback(async () => {
    if (tasksVisible) {
      // Zapamiętaj pozycje kart zadań na czas sesji i zdejmij je z kanwy.
      const positions = new Map(nodes.filter((n) => isTaskNode(n.id)).map((n) => [n.id, n.position]));
      setNodes((nds) => nds.filter((n) => !isTaskNode(n.id)));
      setEdges((eds) => eds.filter((e) => !isTaskNode(e.source) && !isTaskNode(e.target)));
      setTaskSnapshot((snap) => snap.map((s) => ({ ...s, position: positions.get(`task:${s.id}`) ?? s.position })));
      setTasksVisible(false);
      return;
    }

    try {
      const tasks = await getTasksForBoardAction(projectId);
      const merged: TaskSnapshot[] = tasks.map((task, index) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        done: task.is_done,
        position: taskSnapshot.find((entry) => entry.id === task.id)?.position ?? {
          x: 900 + (index % 4) * 260,
          y: 80 + Math.floor(index / 4) * 200,
        },
      }));
      setTaskSnapshot(merged);
      const taskNodes: Node<TaskData>[] = merged.map((snapshot) => ({
        id: `task:${snapshot.id}`,
        type: "task",
        position: snapshot.position,
        data: { taskId: snapshot.id, title: snapshot.title, status: snapshot.status, done: snapshot.done, projectId },
      }));
      setNodes((nds) => [...nds.filter((n) => !isTaskNode(n.id)), ...taskNodes]);
      setTasksVisible(true);
    } catch (e) {
      console.error("Failed to load tasks", e);
      toast.error(t("loadError"));
    }
  }, [tasksVisible, taskSnapshot, nodes, projectId, setNodes, setEdges, t]);

  const changeSelectedColor = useCallback(
    (color: string) => {
      const selected = new Set(lastSelected.map((s) => s.id));
      setNodes((nds) =>
        nds.map((node) =>
          selected.has(node.id) && node.type === "sticky" ? { ...node, data: { ...node.data, color }, selected: true } : node
        )
      );
    },
    [lastSelected, setNodes]
  );

  const handleAIConvert = async () => {
    const texts = lastSelected
      .filter((n) => !isTaskNode(n.id))
      .map((n) => (n.data as NoteData).content?.trim())
      .filter((text): text is string => Boolean(text));
    if (texts.length === 0) {
      toast.error(t("aiNeedsSelection"));
      return;
    }
    try {
      setAiProposals(await generateTaskProposals(projectId, texts));
    } catch {
      toast.error(t("aiError"));
    }
  };

  return (
    <div className="w-full h-full relative" onDoubleClick={handleDoubleClick}>
      {board?.canEdit && (
        <div className="pointer-events-none absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-border bg-background/80 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
          {t("canvasHint")}
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        nodeTypes={nodeTypes}
        nodesDraggable={Boolean(board?.canEdit)}
        nodesConnectable={Boolean(board?.canEdit)}
        deleteKeyCode={null}
        // Double-click adds a note (handleDoubleClick); zooming on it swallowed the event.
        zoomOnDoubleClick={false}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.25 }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls />
        <MiniMap pannable />
      </ReactFlow>

      <WhiteboardToolbar
        canEdit={Boolean(board?.canEdit)}
        ai={Boolean(board?.ai)}
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
        <TaskProposalModal projectId={projectId} proposals={aiProposals} onClose={() => setAiProposals(null)} />
      )}
    </div>
  );
}

export function WhiteboardCanvas({ projectId }: { projectId: string }) {
  return (
    <ReactFlowProvider>
      <WhiteboardFlow projectId={projectId} />
    </ReactFlowProvider>
  );
}
