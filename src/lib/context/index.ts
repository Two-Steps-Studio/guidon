/**
 * Context Layer Utilities
 * Helper functions for working with the Context Layer
 */

import type {
  ContextEntityType,
  ContextReference,
  ContextRelation,
  RelationType,
} from '@/types/context';

/**
 * Create a context reference
 */
export function createContextReference(
  entityType: ContextEntityType,
  entityId: string
): ContextReference {
  return { entityType, entityId };
}

/**
 * Validate a context reference
 */
export function isValidContextReference(ref: ContextReference): boolean {
  const validEntityTypes: ContextEntityType[] = [
    'project',
    'task',
    'phase',
    'decision',
    'file',
    'source',
    'memory',
  ];
  return validEntityTypes.includes(ref.entityType) && !!ref.entityId;
}

/**
 * Check if a relation type is valid
 */
export function isValidRelationType(type: string): type is RelationType {
  const validTypes: RelationType[] = [
    'depends_on',
    'blocks',
    'implements',
    'references',
    'decided_by',
    'based_on',
    'related_to',
    'contradicts',
    'supersedes',
    'part_of',
    'contains',
  ];
  return validTypes.includes(type as RelationType);
}

/**
 * Check if a self-relation is allowed
 * Most relations should not point to the same entity
 */
export function isSelfRelationAllowed(relationType: RelationType): boolean {
  // Some relations might allow self-reference in specific cases
  // For now, disallow all self-relations
  return false;
}

/**
 * Check if two context references are equal
 */
export function contextReferencesEqual(
  a: ContextReference,
  b: ContextReference
): boolean {
  return a.entityType === b.entityType && a.entityId === b.entityId;
}

/**
 * Get the inverse relation type
 * e.g., if A depends_on B, then B is depended_on by A
 */
export function getInverseRelationType(relationType: RelationType): RelationType | null {
  const inverses: Record<RelationType, RelationType | null> = {
    depends_on: null, // No direct inverse
    blocks: 'blocked_by' as RelationType, // Would need to be added to RelationType
    implements: 'implemented_by' as RelationType,
    references: 'referenced_by' as RelationType,
    decided_by: null,
    based_on: 'basis_for' as RelationType,
    related_to: 'related_to', // Symmetric
    contradicts: 'contradicts', // Symmetric
    supersedes: 'superseded_by' as RelationType,
    part_of: 'contains', // Inverse of contains
    contains: 'part_of', // Inverse of part_of
  };
  return inverses[relationType];
}

/**
 * Build a context graph from relations
 */
export function buildContextGraph(relations: ContextRelation[]) {
  const nodes = new Map<string, { entityType: ContextEntityType; entityId: string }>();
  const edges: Array<{
    source: ContextReference;
    target: ContextReference;
    relationType: RelationType;
  }> = [];

  relations.forEach((relation) => {
    const sourceKey = `${relation.source_type}:${relation.source_id}`;
    const targetKey = `${relation.target_type}:${relation.target_id}`;

    // Add nodes
    nodes.set(sourceKey, {
      entityType: relation.source_type,
      entityId: relation.source_id,
    });
    nodes.set(targetKey, {
      entityType: relation.target_type,
      entityId: relation.target_id,
    });

    // Add edge
    edges.push({
      source: {
        entityType: relation.source_type,
        entityId: relation.source_id,
      },
      target: {
        entityType: relation.target_type,
        entityId: relation.target_id,
      },
      relationType: relation.relation_type,
    });
  });

  return {
    nodes: Array.from(nodes.values()),
    edges,
  };
}
