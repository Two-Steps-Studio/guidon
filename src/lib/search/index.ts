/**
 * Search Utilities
 * Helper functions for full-text search
 */

import type { SearchResult, SearchFilters, ContextEntityType } from '@/types/context';

/**
 * Build a PostgreSQL full-text search query
 */
export function buildSearchQuery(
  searchTerm: string,
  filters: SearchFilters = {}
): string {
  const conditions: string[] = [];
  const params: any[] = [];

  // Add search term
  if (searchTerm) {
    conditions.push(`to_tsvector('english', content) @@ to_tsquery('english', $${params.length + 1})`);
    params.push(searchTerm.split(' ').join(' & '));
  }

  // Add project filter
  if (filters.project_id) {
    conditions.push(`project_id = $${params.length + 1}`);
    params.push(filters.project_id);
  }

  // Add entity type filter
  if (filters.entity_types && filters.entity_types.length > 0) {
    conditions.push(`entity_type = ANY($${params.length + 1})`);
    params.push(filters.entity_types);
  }

  // Add date range filters
  if (filters.date_from) {
    conditions.push(`created_at >= $${params.length + 1}`);
    params.push(filters.date_from);
  }

  if (filters.date_to) {
    conditions.push(`created_at <= $${params.length + 1}`);
    params.push(filters.date_to);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return whereClause;
}

/**
 * Parse search results and format them
 */
export function formatSearchResults<T>(
  results: any[],
  entityType: ContextEntityType,
  searchTerm: string
): SearchResult<T>[] {
  return results.map((row) => ({
    entity: row as T,
    entityType,
    relevance: row.rank || 0,
    highlights: extractHighlights(row, searchTerm),
  }));
}

/**
 * Extract highlights from search results
 */
function extractHighlights(row: any, searchTerm: string): string[] {
  const highlights: string[] = [];
  const fields = ['title', 'description', 'content', 'name'];

  fields.forEach((field) => {
    if (row[field]) {
      const text = row[field];
      const index = text.toLowerCase().indexOf(searchTerm.toLowerCase());
      if (index !== -1) {
        const start = Math.max(0, index - 50);
        const end = Math.min(text.length, index + searchTerm.length + 50);
        const excerpt = text.substring(start, end);
        highlights.push(`...${excerpt}...`);
      }
    }
  });

  return highlights;
}

/**
 * Normalize search term for better matching
 */
export function normalizeSearchTerm(term: string): string {
  return term
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Build search suggestions based on partial input
 */
export function buildSearchSuggestions(partial: string, existingTerms: string[]): string[] {
  const normalized = normalizeSearchTerm(partial);
  if (normalized.length < 2) return [];

  return existingTerms
    .filter((term) => term.toLowerCase().includes(normalized))
    .slice(0, 10);
}
