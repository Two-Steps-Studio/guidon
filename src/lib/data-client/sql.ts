/**
 * Compiles a data-client query (see ./index.ts) into one parameterized SQL
 * statement for the self-hosted branch. Pure and dependency-free on purpose,
 * so tests/db/compat.test.mjs can import it directly and run the generated
 * SQL against the real schema + RLS.
 *
 * Identifiers (table, columns) come from application code, never from a
 * request, but are still checked against a strict pattern and quoted - only
 * values are ever passed as bind parameters, and they always are.
 */

export type FilterOp = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "like" | "ilike" | "in" | "is";

export interface Filter {
  column: string;
  op: FilterOp;
  value: unknown;
}

export interface OrderBy {
  column: string;
  ascending: boolean;
  nullsFirst?: boolean;
}

export interface QuerySpec {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  /** Columns to return. `null` = no RETURNING (a mutation without .select()). */
  columns: string[] | null;
  filters: Filter[];
  order: OrderBy[];
  limit: number | null;
  /** insert: one or more rows; update: the patch. */
  values: Record<string, unknown>[] | null;
}

export interface CompiledQuery {
  text: string;
  values: unknown[];
}

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function ident(name: string): string {
  if (!IDENTIFIER.test(name)) throw new Error(`data-client: invalid identifier "${name}"`);
  return `"${name}"`;
}

/**
 * "id, name, created_at" or "*". PostgREST embeds like `profiles(full_name)`
 * have no single-table SQL equivalent here - write those as explicit queries.
 */
export function parseColumns(columns: string): string[] {
  const list = columns
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  if (list.length === 0) return ["*"];
  for (const c of list) {
    if (c === "*") continue;
    if (c.includes("(") || c.includes(":") || c.includes("!")) {
      throw new Error(`data-client: embedded/renamed selects are not supported ("${c}") - use a hand-written query`);
    }
    ident(c);
  }
  return list;
}

function columnList(columns: string[]): string {
  return columns.map((c) => (c === "*" ? "*" : ident(c))).join(", ");
}

function where(filters: Filter[], values: unknown[]): string {
  if (filters.length === 0) return "";
  const parts = filters.map(({ column, op, value }) => {
    const col = ident(column);
    const param = () => {
      values.push(value);
      return `$${values.length}`;
    };
    switch (op) {
      case "eq":
        return `${col} = ${param()}`;
      case "neq":
        return `${col} <> ${param()}`;
      case "gt":
        return `${col} > ${param()}`;
      case "gte":
        return `${col} >= ${param()}`;
      case "lt":
        return `${col} < ${param()}`;
      case "lte":
        return `${col} <= ${param()}`;
      case "like":
        return `${col} LIKE ${param()}`;
      case "ilike":
        return `${col} ILIKE ${param()}`;
      case "in":
        if (!Array.isArray(value)) throw new Error("data-client: .in() needs an array");
        // An empty IN list matches nothing - same as PostgREST's in.()
        if (value.length === 0) return "false";
        return `${col} = ANY(${param()})`;
      case "is":
        if (value === null) return `${col} IS NULL`;
        if (value === true) return `${col} IS TRUE`;
        if (value === false) return `${col} IS FALSE`;
        throw new Error("data-client: .is() only takes null, true or false");
    }
  });
  return ` WHERE ${parts.join(" AND ")}`;
}

function returning(columns: string[] | null): string {
  return columns ? ` RETURNING ${columnList(columns)}` : "";
}

export function compile(spec: QuerySpec): CompiledQuery {
  const table = ident(spec.table);
  const values: unknown[] = [];

  switch (spec.op) {
    case "select": {
      let text = `SELECT ${columnList(spec.columns ?? ["*"])} FROM ${table}${where(spec.filters, values)}`;
      if (spec.order.length > 0) {
        text += ` ORDER BY ${spec.order
          .map(
            (o) =>
              `${ident(o.column)} ${o.ascending ? "ASC" : "DESC"}` +
              (o.nullsFirst === undefined ? "" : o.nullsFirst ? " NULLS FIRST" : " NULLS LAST")
          )
          .join(", ")}`;
      }
      if (spec.limit !== null) {
        values.push(spec.limit);
        text += ` LIMIT $${values.length}`;
      }
      return { text, values };
    }

    case "insert": {
      const rows = spec.values ?? [];
      if (rows.length === 0) throw new Error("data-client: insert needs at least one row");
      // Union of keys across rows (PostgREST does the same); a row missing a
      // key gets DEFAULT rather than NULL so column defaults still apply.
      const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
      const tuples = rows.map((row) => {
        const cells = keys.map((key) => {
          if (!(key in row) || row[key] === undefined) return "DEFAULT";
          values.push(row[key]);
          return `$${values.length}`;
        });
        return `(${cells.join(", ")})`;
      });
      const text = `INSERT INTO ${table} (${keys.map(ident).join(", ")}) VALUES ${tuples.join(", ")}${returning(spec.columns)}`;
      return { text, values };
    }

    case "update": {
      const patch = spec.values?.[0] ?? {};
      const keys = Object.keys(patch).filter((key) => patch[key] !== undefined);
      if (keys.length === 0) throw new Error("data-client: update needs at least one column");
      if (spec.filters.length === 0) throw new Error("data-client: refusing an UPDATE without filters");
      const sets = keys.map((key) => {
        values.push(patch[key]);
        return `${ident(key)} = $${values.length}`;
      });
      const text = `UPDATE ${table} SET ${sets.join(", ")}${where(spec.filters, values)}${returning(spec.columns)}`;
      return { text, values };
    }

    case "delete": {
      if (spec.filters.length === 0) throw new Error("data-client: refusing a DELETE without filters");
      const text = `DELETE FROM ${table}${where(spec.filters, values)}${returning(spec.columns)}`;
      return { text, values };
    }
  }
}
