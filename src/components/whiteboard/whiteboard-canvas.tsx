"use client";

import React, { useCallback, useState, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  Connection,
  NodeUpdate,
  NodePosition,
  useNodesState,
  useEdgesState,
  addEdge,
  ConnectionMode,
} from "reactflow";
import "reactflow/dist/style.css";
import { WhiteboardElement, getElements, upsertElement } from "@/lib/data/whiteboard";
import { useDebounce } from "@/hooks/use-debounce";
import { TaskProposalModal } from "./task-proposal-modal";
import { WhiteboardToolbar } from "./whiteboard-toolbar";
import { generateTaskProposals } from "@/app/projects/[id]/whiteboard/actions";
import { toast } from "sonner";

interface WhiteboardCanvasProps {
  projectId: string;
}

const StickyNode = ({ data, id }: any) => {
  const handleTextChange = (e: React.FormEvent<HTMLDivElement>) => {
    const newText = e.currentTarget.innerText;
    if (data.onChange) {
      data.onChange(id, newText);
    }
  };

  return (
    <div
      className="p-3 rounded-sm shadow-sm border border-border min-w-[150px] min-h-[100px] bg-yellow-100 dark:bg-yellow-900/30 text-foreground"
      style={{ backgroundColor: data.color }}
    >
      <div className="text-xs font-medium opacity-50 mb-1">Sticky Note</div>
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

const nodeTypes = {
  sticky: StickyNode,
};

export function WhiteboardCanvas({ projectId }: WhiteboardCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);
  const [lastSavedNodes, setLastSavedNodes] = useState<Node[]>([]);
  const [selectedNodes, setSelectedNodes] = useState<Node[]');
  const [aiProposals, setAiProposals] = useState<{ prose: string; proposals: any[] } | null>(null);

  const debouncedNodes = useDebounce(nodes, 1000);

  useEffect(() => {
    if (debouncedNodes === lastSavedNodes) return;

    async function saveElements() {
      const elements = debouncedNodes.map(node => ({
        board_id: "default",
        type: node.type,
        x: node.position.x,
        y: node.position.y,
        width: (node as any).width || 150,
        height: (node as any).height || 150,
        content: { text: (node.data as any).content },
        color: (node.data as any).color,
      }));

      try {
        for (const el of elements) {
          await upsertElement(projectId, el);
        }
        setLastSavedNodes([...debouncedNodes]);
      } catch (e) {
        console.error("Failed to save elements", e);
      }
    }
    saveElements();
  }, [debouncedNodes, projectId]);

  useEffect(() => {
    async function loadElements() {
      setLoading(true);
      try {
        const elements = await getElements("default", projectId);
        const initialNodes = elements.map(el => ({
          id: el.id,
          type: el.type,
          position: { x: el.x, y: el.y },
          data: {
            content: el.content?.text,
            color: el.content?.color,
            onChange: (id: string, text: string) => {
              setNodes(nds => nds.map(node =>
                node.id === id
                  ? { ...node, data: { ...node.data, content: text } }
                  : node
              ));
            }
          },
        }));
        setNodes(initialNodes);
        setLastSavedNodes(initialNodes);
      } catch (e) {
        console.error("Failed to load elements", e);
      } finally {
        setLoading(false);
      }
    }
    loadElements();
  }, [projectId]);

  const onSelectionChange = useCallback((nodes: Node[]) => {
    setSelectedNodes(nodes);
  }, []);

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge(params, eds));
  }, []);

  const handleAIConvert = async () => {
    const texts = selectedNodes.map(n => (n.data as any).content).filter(Boolean);
    if (texts.length === 0) {
      toast.error("Please select at least one sticky note with text");
      return;
    }

    try {
      const result = await generateTaskProposals(projectId, texts);
      setAiProposals(result);
    } catch (e) {
      toast.error("AI conversion failed");
    }
  };

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        fitView
      >
        <Background variant="dots" gap={20} size={1} />
        <Controls />
        <MiniMap />
      </ReactFlow>

      <WhiteboardToolbar
        projectId={projectId}
        selectedNodes={selectedNodes}
        onAIConvert={handleAIConvert}
      />

      {aiProposals && (
        <TaskProposalModal
          open={!!aiProposals}
          onClose={() => setAiProposals(null)}
          projectId={projectId}
          proposals={aiProposals.proposals}
          onConfirmed={() => setAiPproposals(null)}
        />
      )}
    </div>
  );
}
