export type MoneyReadinessStatus = "pass" | "needs_review" | "failed";

export type MoneyReadinessSnapshot = {
  schema_version?: number;
  generated_at?: string;
  status?: string;
  critical?: Record<string, unknown>;
  review?: Record<string, unknown>;
  operational?: Record<string, unknown>;
  processor?: Record<string, unknown>;
  [key: string]: unknown;
};

export type MoneyReadinessFinding = {
  metric: string;
  value: number;
};

export type MoneyReadinessProof = {
  schemaVersion: 1;
  generatedAt: string;
  validationCommit: string | null;
  validationSource: string;
  snapshotSchemaVersion: number | null;
  snapshotGeneratedAt: string | null;
  status: MoneyReadinessStatus;
  certifiable: boolean;
  criticalFindings: MoneyReadinessFinding[];
  reviewFindings: MoneyReadinessFinding[];
  reasons: string[];
  snapshot: MoneyReadinessSnapshot | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finiteMetric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function positiveFindings(value: unknown): MoneyReadinessFinding[] {
  const record = asRecord(value);
  if (!record) return [];

  return Object.entries(record).flatMap(([metric, rawValue]) => {
    const numeric = finiteMetric(rawValue);
    return numeric !== null && numeric > 0 ? [{ metric, value: numeric }] : [];
  });
}

function normalizedSnapshotStatus(value: unknown): MoneyReadinessStatus | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "pass" || normalized === "ready") return "pass";
  if (normalized === "needs_review" || normalized === "needs review" || normalized === "warning") {
    return "needs_review";
  }
  if (normalized === "fail" || normalized === "failed" || normalized === "critical_failed") return "failed";
  return null;
}

export function buildMoneyReadinessProof(input: {
  snapshot: unknown;
  validationCommit?: string | null;
  generatedAt?: string;
  validationSource?: string;
}): MoneyReadinessProof {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const snapshotRecord = asRecord(input.snapshot) as MoneyReadinessSnapshot | null;
  const snapshotSchemaVersion = snapshotRecord ? finiteMetric(snapshotRecord.schema_version) : null;
  const snapshotStatus = normalizedSnapshotStatus(snapshotRecord?.status);
  const criticalFindings = positiveFindings(snapshotRecord?.critical);
  const reviewFindings = positiveFindings(snapshotRecord?.review);
  const reasons: string[] = [];

  if (!snapshotRecord) reasons.push("The production money snapshot was unavailable or malformed.");
  if (snapshotSchemaVersion === null || snapshotSchemaVersion < 2) {
    reasons.push("The production money snapshot is not on the Mission 2 schema-v2 contract.");
  }
  if (!snapshotStatus) reasons.push("The production money snapshot did not return a recognized status.");
  if (!input.validationCommit?.trim()) reasons.push("The proof is not bound to a Git commit.");
  if (criticalFindings.length) {
    reasons.push(`${criticalFindings.length} critical money invariant${criticalFindings.length === 1 ? " is" : "s are"} failing.`);
  }
  if (reviewFindings.length) {
    reasons.push(`${reviewFindings.length} money evidence item${reviewFindings.length === 1 ? " needs" : "s need"} review.`);
  }

  const certifiable = Boolean(
    snapshotRecord
      && snapshotSchemaVersion !== null
      && snapshotSchemaVersion >= 2
      && snapshotStatus === "pass"
      && input.validationCommit?.trim()
      && criticalFindings.length === 0
      && reviewFindings.length === 0
  );

  const status: MoneyReadinessStatus = certifiable
    ? "pass"
    : snapshotStatus === "failed" || criticalFindings.length > 0
      ? "failed"
      : "needs_review";

  return {
    schemaVersion: 1,
    generatedAt,
    validationCommit: input.validationCommit?.trim() || null,
    validationSource: input.validationSource ?? "bvrb3r_v1_money_readiness_snapshot RPC",
    snapshotSchemaVersion,
    snapshotGeneratedAt: typeof snapshotRecord?.generated_at === "string" ? snapshotRecord.generated_at : null,
    status,
    certifiable,
    criticalFindings,
    reviewFindings,
    reasons,
    snapshot: snapshotRecord
  };
}

export function moneyProofMatchesCommit(proof: MoneyReadinessProof | null, runtimeCommit: string | null | undefined) {
  return Boolean(
    proof?.certifiable
      && runtimeCommit?.trim()
      && proof.validationCommit === runtimeCommit.trim()
  );
}
