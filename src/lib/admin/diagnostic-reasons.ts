export const DIAGNOSTIC_REASONS = ["support", "incident", "access"] as const;
export type DiagnosticReason = typeof DIAGNOSTIC_REASONS[number];

export function isDiagnosticReason(reason: unknown): reason is DiagnosticReason {
  return typeof reason === "string" && DIAGNOSTIC_REASONS.some(value => value === reason);
}
