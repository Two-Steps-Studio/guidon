"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Plus, Sparkles } from "lucide-react";
import { upsertElement } from "@/lib/data/whiteboard";
import type { Node } from "reactflow";

interface WhiteboardToolbarProps {
  projectId: string;
  selectedNodes: Node[];
  onAIConvert: () => void;
}

export function WhiteboardToolbar({ projectId, selectedNodes, onAIConvert }: WhiteboardToolbarProps) {
  const addSticky = async () => {
    await upsertElement(projectId, {
      type: "sticky",
      x: 0,
      y: 0,
      content: { text: "New Note", color: "#fef3c7" },
    });
  };

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 p-2 bg-background/80 backdrop-blur-md border border-border rounded-full shadow-lg">
      <Button variant="ghost" size="sm" onClick={addSticky} className="gap-2">
        <Plus size={16} />
        <span>Add Sticky</span>
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
