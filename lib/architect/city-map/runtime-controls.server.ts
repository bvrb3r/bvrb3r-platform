import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ArchitectSystemControlKey } from "@/lib/architect/city-map/controls.server";

type RuntimeControlRow = {
  control_key: ArchitectSystemControlKey;
  active: boolean;
  reason: string | null;
  version: number | string;
};

const CONTROL_COPY: Record<ArchitectSystemControlKey, string> = {
  maintenance: "BVRB3R is in maintenance mode. This operation is temporarily unavailable.",
  bookings: "New bookings are temporarily paused.",
  kiosks: "Kiosk operations are temporarily disabled.",
  payouts: "Payout execution is temporarily frozen.",
  hive_ai: "Hive AI execution is temporarily paused."
};

function isMissingControlTable(error: { code?: string | null; message?: string | null }) {
  const message = String(error.message ?? "").toLowerCase();
  return error.code === "42P01"
    || error.code === "PGRST205"
    || (message.includes("architect_system_controls") && message.includes("does not exist"));
}

export class ArchitectRuntimeControlError extends Error {
  readonly status = 503;
  readonly code = "architect_system_control_active";

  constructor(
    readonly controlKey: ArchitectSystemControlKey,
    message = CONTROL_COPY[controlKey]
  ) {
    super(message);
    this.name = "ArchitectRuntimeControlError";
  }
}

/**
 * Enforces an Architect kill switch at a server mutation boundary.
 *
 * Maintenance applies to every guarded mutation. A missing table is tolerated
 * only for the deploy window where application code can precede its forward
 * migration. Once the table exists, an unreadable or incomplete control state
 * fails closed instead of guessing that operations are safe.
 */
export async function assertArchitectRuntimeControlAllows(
  supabase: SupabaseClient,
  controlKey: Exclude<ArchitectSystemControlKey, "maintenance">
) {
  const keys: ArchitectSystemControlKey[] = ["maintenance", controlKey];
  const result = await supabase
    .from("architect_system_controls")
    .select("control_key, active, reason, version")
    .in("control_key", keys);

  if (result.error) {
    if (isMissingControlTable(result.error)) return;
    throw new ArchitectRuntimeControlError(
      controlKey,
      "The system control state could not be verified. This operation is blocked."
    );
  }

  const rows = (result.data ?? []) as RuntimeControlRow[];
  if (rows.length !== keys.length) {
    throw new ArchitectRuntimeControlError(
      controlKey,
      "The system control state is incomplete. This operation is blocked."
    );
  }

  const active = rows.find((row) => row.active);
  if (active) {
    throw new ArchitectRuntimeControlError(active.control_key);
  }
}
