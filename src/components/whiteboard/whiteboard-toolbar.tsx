"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Plus, Sparkles } from "lucide-react";
import { upsertElementAction } from "@/app/projects/[id]/whiteboard/actions";
import type { Node } from "reactflow";

interface WhiteboardToolbarProps {
  projectId: string;
  selectedNodes: Node[];
  onAIConvert: () => void;
}

export function WhiteboardToolbar({ projectId, selectedNodes, onAIConvert }: WhiteboardToolbarProps) {
  const addElement = async (type: "sticky" | "shape", shape?: "rectangle" | "circle") => {
    try {
      await upsertElementAction(projectId, {
        type: type === "sticky" ? "sticky" : "shape",
        x: 100,
        y: 100,
        content: {
          text: "New Element",
          color: type === "sticky" ? "#fef3c7" : "#e2e8f0",
          shape: shape || "rectangle"
        },
      });
      window.location.reload();
    } catch (e) {
      console.error(`Failed to add ${type}`, e);
    }
  };

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 p-2 bg-background/80 backdrop-blur-md border border-border rounded-full shadow-lg">
      <Button variant="ghost" size="sm" onClick={() => addElement("sticky")} className="gap-2">
        <Plus size={16} />
        <span>Add Sticky</span>
      </Button>
      <Button variant="ghost" size="sm" onClick={() => addElement("shape", "rectangle")} className="gap-2">
        <div className="size-3 border border-foreground" />
        <span>Rectangle</span>
      </Button>
      <Button variant="ghost" size="sm" onClick={() => addElement("shape", "circle")} className="gap-2">
        <div className="size-3 border border-foreground rounded-full" />
        <span>Circle</span>
      </Button>
      <div className="w-px h-4 bg-border mx-1" />
      <Button
        variant="ghost"
        size="sm"
        onClick={onAIConvert}
        disabled={selectedNodes.length === 0}
        className="gap-2 text-primary disabled:opacity-50"
      >
        <Sparkles size={16} />
        <span>AI Convert to Tasks</span>
      </Button>
    </div>
  );
}
