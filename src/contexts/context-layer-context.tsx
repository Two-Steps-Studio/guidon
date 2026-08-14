'use client';

import React, { createContext, useContext, useState } from 'react';
import type {
  Decision,
  ContextRelation,
  ContextSource,
  ProjectMemory,
  ContextGraph,
  WhyContext,
} from '@/types/context';

interface ContextLayerContextType {
  decisions: Decision[];
  relations: ContextRelation[];
  sources: ContextSource[];
  memory: ProjectMemory[];
  contextGraph: ContextGraph | null;
  setDecisions: (decisions: Decision[]) => void;
  setRelations: (relations: ContextRelation[]) => void;
  setSources: (sources: ContextSource[]) => void;
  setMemory: (memory: ProjectMemory[]) => void;
  setContextGraph: (graph: ContextGraph | null) => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  getWhyContext: (entityType: string, entityId: string) => Promise<WhyContext | null>;
}

const ContextLayerContext = createContext<ContextLayerContextType | undefined>(undefined);

export function ContextLayerProvider({ children }: { children: React.ReactNode }) {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [relations, setRelations] = useState<ContextRelation[]>([]);
  const [sources, setSources] = useState<ContextSource[]>([]);
  const [memory, setMemory] = useState<ProjectMemory[]>([]);
  const [contextGraph, setContextGraph] = useState<ContextGraph | null>(null);
  const [loading, setLoading] = useState(false);

  const getWhyContext = async (entityType: string, entityId: string): Promise<WhyContext | null> => {
    // This will be implemented with actual API calls
    // For now, return null as placeholder
    return null;
  };

  return (
    <ContextLayerContext.Provider
      value={{
        decisions,
        relations,
        sources,
        memory,
        contextGraph,
        setDecisions,
        setRelations,
        setSources,
        setMemory,
        setContextGraph,
        loading,
        setLoading,
        getWhyContext,
      }}
    >
      {children}
    </ContextLayerContext.Provider>
  );
}

export function useContextLayer() {
  const context = useContext(ContextLayerContext);
  if (context === undefined) {
    throw new Error('useContextLayer must be used within a ContextLayerProvider');
  }
  return context;
}
