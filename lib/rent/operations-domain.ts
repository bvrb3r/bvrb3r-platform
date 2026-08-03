export const AUTOBOOTH_GATE_KEYS = [
  "native_transaction",
  "active_obligation",
  "settled_payment",
  "shop_enabled",
  "barber_authorized"
] as const;

export type AutoBoothGateKey = (typeof AUTOBOOTH_GATE_KEYS)[number];

export type AutoBoothGateInput = Record<AutoBoothGateKey, boolean>;

export type AutoBoothGateDecision = {
  eligible: boolean;
  passedCount: number;
  requiredCount: number;
  gates: Array<{
    key: AutoBoothGateKey;
    passed: boolean;
  }>;
  failed: AutoBoothGateKey[];
};

export function evaluateAutoBoothGates(input: AutoBoothGateInput): AutoBoothGateDecision {
  const gates = AUTOBOOTH_GATE_KEYS.map((key) => ({ key, passed: input[key] === true }));
  const failed = gates.filter((gate) => !gate.passed).map((gate) => gate.key);

  return {
    eligible: failed.length === 0,
    passedCount: gates.length - failed.length,
    requiredCount: gates.length,
    gates,
    failed
  };
}

function integerCents(value: number, label: string) {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a safe integer number of cents.`);
  }
  return value;
}

export type RentStatementLineState =
  | "pending"
  | "settled"
  | "held"
  | "reversed"
  | "failed"
  | "canceled";

export type RentStatementLine = {
  id: string;
  kind: string;
  state: RentStatementLineState;
  appliedCents: number;
  createdAt: string;
  reference: string | null;
  disputed: boolean;
  reversalOfContributionId?: string | null;
};

export type RentStatementInput = {
  obligationId: string;
  periodStart: string;
  periodEnd: string;
  obligationCents: number;
  settledCents: number;
  remainingCents: number;
  lines: readonly RentStatementLine[];
};

export type RentStatement = RentStatementInput & {
  lineSettledCents: number;
  pendingCents: number;
  heldCents: number;
  reversedCents: number;
  reconciliationDeltaCents: number;
  reconciled: boolean;
};

export function buildRentStatement(input: RentStatementInput): RentStatement {
  const obligationCents = Math.max(integerCents(input.obligationCents, "Obligation"), 0);
  const settledCents = Math.max(integerCents(input.settledCents, "Settled amount"), 0);
  const remainingCents = Math.max(integerCents(input.remainingCents, "Remaining amount"), 0);

  let lineSettledCents = 0;
  let pendingCents = 0;
  let heldCents = 0;
  let reversedCents = 0;

  for (const line of input.lines) {
    const amount = Math.max(integerCents(line.appliedCents, "Statement line"), 0);
    if (line.state === "reversed" || line.reversalOfContributionId) {
      reversedCents += amount;
      lineSettledCents -= amount;
    } else if (line.state === "held" || line.disputed) {
      heldCents += amount;
    } else if (line.state === "pending") {
      pendingCents += amount;
    } else if (line.state === "settled") {
      lineSettledCents += amount;
    }
  }

  const reconciliationDeltaCents = obligationCents - settledCents - remainingCents;

  return {
    ...input,
    obligationCents,
    settledCents,
    remainingCents,
    lineSettledCents,
    pendingCents,
    heldCents,
    reversedCents,
    reconciliationDeltaCents,
    reconciled: reconciliationDeltaCents === 0 && lineSettledCents === settledCents
  };
}

export function assertSettleFirst(input: {
  remainingCents: number;
  pendingCents?: number;
  heldCents?: number;
}) {
  const remainingCents = Math.max(integerCents(input.remainingCents, "Remaining amount"), 0);
  const pendingCents = Math.max(integerCents(input.pendingCents ?? 0, "Pending amount"), 0);
  const heldCents = Math.max(integerCents(input.heldCents ?? 0, "Held amount"), 0);

  if (remainingCents > 0 || pendingCents > 0 || heldCents > 0) {
    throw new Error("Rent must settle to $0.00 before this relationship can pause, leave, or end.");
  }
}

export function resolveNextRentEffectiveAt(input: {
  requestedAt: string;
  activePeriodEnd: string | null;
  now?: Date;
}) {
  const requestedAt = new Date(input.requestedAt);
  const now = input.now ?? new Date();
  if (!Number.isFinite(requestedAt.getTime()) || requestedAt.getTime() <= now.getTime()) {
    throw new Error("A rent agreement version must take effect in the future.");
  }

  if (input.activePeriodEnd) {
    const activePeriodEnd = new Date(`${input.activePeriodEnd}T23:59:59.999Z`);
    if (!Number.isFinite(activePeriodEnd.getTime()) || requestedAt.getTime() <= activePeriodEnd.getTime()) {
      throw new Error("A rent change cannot take effect during a rent period already in progress.");
    }
  }

  return requestedAt.toISOString();
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function buildRentStatementCsv(statement: RentStatement) {
  const rows: Array<Array<string | number>> = [
    ["BVRB3R rent statement", statement.obligationId],
    ["Period start", statement.periodStart],
    ["Period end", statement.periodEnd],
    [],
    ["Line ID", "Kind", "State", "Applied cents", "Reference"],
    ...statement.lines.map((line) => [
      line.id,
      line.kind,
      line.state,
      line.appliedCents,
      line.reference ?? ""
    ]),
    [],
    ["Obligation cents", statement.obligationCents],
    ["Settled cents", statement.settledCents],
    ["Remaining cents", statement.remainingCents],
    ["Pending cents", statement.pendingCents],
    ["Held cents", statement.heldCents],
    ["Reversed cents", statement.reversedCents],
    ["Reconciliation delta cents", statement.reconciliationDeltaCents]
  ];

  return `${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

function escapePdfText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

export function buildRentStatementPdf(statement: RentStatement) {
  const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const displayLines = [
    "BVRB3R RENT STATEMENT",
    `Period ${statement.periodStart} through ${statement.periodEnd}`,
    `Obligation ${money(statement.obligationCents)}`,
    `Settled ${money(statement.settledCents)}`,
    `Remaining ${money(statement.remainingCents)}`,
    `Pending ${money(statement.pendingCents)}`,
    `Held ${money(statement.heldCents)}`,
    `Reversed ${money(statement.reversedCents)}`,
    `Reconciliation delta ${money(statement.reconciliationDeltaCents)}`,
    "",
    ...statement.lines.slice(0, 28).map((line) => (
      `${line.createdAt.slice(0, 10)}  ${line.kind}  ${line.state}  ${money(line.appliedCents)}`
    ))
  ];
  const content = [
    "BT",
    "/F1 10 Tf",
    "50 752 Td",
    ...displayLines.flatMap((line, index) => (
      index === 0
        ? [`(${escapePdfText(line)}) Tj`]
        : ["0 -18 Td", `(${escapePdfText(line)}) Tj`]
    )),
    "ET"
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${byteLength(content)} >>\nstream\n${content}\nendstream`
  ];

  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  body += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new TextEncoder().encode(body);
}

export type RentExportDownloadState =
  | "idle"
  | "preparing"
  | "saved"
  | "not_ready"
  | "not_yours"
  | "failed_retry";

export function resolveRentExportDownloadState(input: {
  requested: boolean;
  preparing: boolean;
  saved: boolean;
  authorized: boolean;
  statementReady: boolean;
  failed: boolean;
}): RentExportDownloadState {
  if (!input.authorized) return "not_yours";
  if (!input.statementReady) return "not_ready";
  if (input.failed) return "failed_retry";
  if (input.saved) return "saved";
  if (input.preparing) return "preparing";
  return input.requested ? "preparing" : "idle";
}
