import type { ArchitectEvidenceItem } from "@/lib/architect/debug/types";

const POSTGRES_CODES: Record<string, string> = {
  "23503": "foreign_key_violation",
  "23502": "not_null_violation",
  "23505": "unique_violation",
  "42703": "undefined_column",
  "22P02": "invalid_uuid_syntax",
  "42501": "permission_or_rls_issue"
};

export function parseArchitectRuntimeLog(input: string) {
  const postgresCode = Object.keys(POSTGRES_CODES).find((code) => input.includes(code)) ?? null;
  const routeMatch = input.match(/(?:GET|POST|PATCH|PUT|DELETE)\s+(\/api\/[^\s]+)/);
  const statusMatch = input.match(/\b(400|401|403|404|409|500)\b/);
  const appointmentMatch = input.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  const stageMatch = input.match(/stage["':\s]+([a-z0-9_:-]+)/i);
  const evidence: ArchitectEvidenceItem[] = [
    {
      label: "route",
      status: routeMatch ? "pass" : "warning",
      detail: routeMatch?.[1] ?? "No route path found."
    },
    {
      label: "postgres code",
      status: postgresCode ? "fail" : "info",
      detail: postgresCode ? `${postgresCode}: ${POSTGRES_CODES[postgresCode]}` : "No postgres code found."
    }
  ];

  return {
    ok: true,
    route: routeMatch?.[1] ?? null,
    httpStatus: statusMatch?.[1] ?? null,
    appointmentId: appointmentMatch?.[0] ?? null,
    postgresCode,
    postgresDiagnosis: postgresCode ? POSTGRES_CODES[postgresCode] : null,
    stage: stageMatch?.[1] ?? null,
    evidence,
    suggestedNextSql: appointmentMatch?.[0]
      ? `select id,status,completed_at,updated_at from appointments where id = '${appointmentMatch[0]}';`
      : null
  };
}
