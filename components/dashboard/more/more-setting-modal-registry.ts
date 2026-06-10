"use client";

import type { MoreSectionRow } from "@/components/dashboard/more/more-components";

export type MoreSettingRoleScope = "client" | "barber" | "owner" | "shared";
export type MoreSettingMode = "editable" | "read_only" | "requirements" | "coming_soon";

export type MoreSettingModalSpec = {
  key: string;
  roleScope: MoreSettingRoleScope;
  sectionKey: string;
  title: string;
  eyebrow: string;
  helper: string;
  mode: MoreSettingMode;
  statusLabel?: string;
  destinationLabel?: string;
  lockedReason?: string;
  requirements?: string[];
};

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function inferMode(row: MoreSectionRow): MoreSettingMode {
  const title = row.title.toLowerCase();
  const subtitle = row.subtitle.toLowerCase();

  if (row.tone === "yellow" || row.needsAction || subtitle.includes("locked") || title.includes("requirements")) {
    return "requirements";
  }

  if (title.includes("performance") || title.includes("transactions") || title.includes("payouts") || title.includes("tax")) {
    return "read_only";
  }

  if (row.href) {
    return "coming_soon";
  }

  return "editable";
}

function requirementsFor(row: MoreSectionRow) {
  const title = row.title.toLowerCase();

  if (title.includes("creator") || title.includes("stripe connect")) {
    return [
      "Verified account",
      "Clean account status",
      "Wallet ready",
      "Loyalty history",
      "Qualifying auto-book or booking activity",
      "Creator or Culture approval"
    ];
  }

  if (title.includes("identity")) {
    return ["Government ID status", "Account ownership proof", "Verification review"];
  }

  if (title.includes("license")) {
    return ["Barber license upload", "License state", "Review status"];
  }

  if (title.includes("business verification")) {
    return ["Shop license", "LLC or business document", "EIN or tax details", "Required uploads"];
  }

  return [];
}

export function resolveMoreSettingModalSpec({
  row,
  roleScope = "shared",
  sectionTitle
}: {
  row: MoreSectionRow;
  roleScope?: MoreSettingRoleScope;
  sectionTitle?: string;
}): MoreSettingModalSpec {
  const mode = inferMode(row);

  return {
    key: `${roleScope}-${slugify(sectionTitle ?? "more")}-${slugify(row.title)}`,
    roleScope,
    sectionKey: slugify(sectionTitle ?? "more"),
    title: row.title,
    eyebrow: sectionTitle ?? "More settings",
    helper: row.subtitle,
    mode,
    statusLabel: row.status,
    destinationLabel: row.href ? "A dedicated settings destination is attached to this row." : undefined,
    lockedReason: mode === "requirements" ? "This setting needs requirements or setup before changes can be saved." : undefined,
    requirements: requirementsFor(row)
  };
}
