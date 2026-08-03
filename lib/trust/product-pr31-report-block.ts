export const PR31_REPORT_REASON_OPTIONS = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "unsafe_conduct", label: "Unsafe conduct" },
  { value: "fake_profile", label: "Fake profile" },
  { value: "payment_scam", label: "Payment scam" },
  { value: "other", label: "Other" }
] as const;

export type Pr31ReportReason = (typeof PR31_REPORT_REASON_OPTIONS)[number]["value"];
export type Pr31ReportSource = "public_profile" | "culture_post" | "message_thread" | "review";

export function toPr27CultureCategory(reason: Pr31ReportReason) {
  switch (reason) {
    case "spam":
      return "spam" as const;
    case "harassment":
      return "harassment" as const;
    case "unsafe_conduct":
      return "dangerous_services" as const;
    case "fake_profile":
    case "payment_scam":
    case "other":
      return "other" as const;
  }
}

export function toTrustReportCategory(reason: Pr31ReportReason) {
  switch (reason) {
    case "harassment":
      return "harassment" as const;
    case "unsafe_conduct":
      return "unsafe_conduct" as const;
    case "fake_profile":
      return "fake_profile" as const;
    case "payment_scam":
      return "fraud" as const;
    case "spam":
    case "other":
      return "inappropriate_behavior" as const;
  }
}

export function buildPr31ReportDetails(input: {
  reason: Pr31ReportReason;
  source: Pr31ReportSource;
  evidenceDescription?: string | null;
}) {
  const evidenceDescription = input.evidenceDescription?.trim();
  return [
    `PR31 reason: ${input.reason}`,
    `Source surface: ${input.source}`,
    `Evidence description: ${evidenceDescription || "Not provided."}`
  ].join("\n");
}
