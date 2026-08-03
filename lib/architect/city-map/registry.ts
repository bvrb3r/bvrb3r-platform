import type {
  ArchitectCityDoor,
  ArchitectCityExit,
  ArchitectCityFloorId
} from "@/lib/architect/city-map/types";

type DoorDefinition = {
  code: string;
  title: string;
  description: string;
  binding: string;
  exit: ArchitectCityExit;
  gates: string[];
  prototypeReviewGate?: number;
};

export type FloorDefinition = {
  id: ArchitectCityFloorId;
  label: string;
  district: string;
  loop: string;
  color: string;
  laneIds: string[];
  doors: DoorDefinition[];
};

const exit = (code: string, title: string, description: string, outcome: string): ArchitectCityExit => ({
  code,
  title,
  description,
  outcome
});

export const ARCHITECT_CITY_FLOORS: FloorDefinition[] = [
  {
    id: "walk_ins",
    label: "Walk-ins",
    district: "Kiosk Plaza",
    loop: "Loops into: activation → rebook direct",
    color: "#C4F24E",
    laneIds: ["operations"],
    doors: [
      {
        code: "DoorW001",
        title: "Next available barber",
        description: "Walk-in enters the public shop kiosk",
        binding: "kiosk /next-available · POST /api/queue/walk-in",
        exit: exit("ExitW001", "Walk-in assigned", "Assigned to a barber, placed in the line", "queue entry waiting · client notification queued"),
        gates: ["Next available selected", "Shop open · eligible barbers", "Rotation order calculated", "Barber assigned", "Queue entry written", "Client confirmed"]
      },
      {
        code: "DoorW002",
        title: "Pick a specific barber",
        description: "Walk-in chooses their own chair",
        binding: "kiosk /pick-barber · POST /api/queue/walk-in",
        exit: exit("ExitW001", "Walk-in assigned", "Assigned to a barber, placed in the line", "queue entry waiting · client notification queued"),
        gates: ["Barber wall opened", "Barber profile loaded", "Availability checked", "Queue entry written", "Client confirmed"]
      },
      {
        code: "DoorW003",
        title: "Check in — BVRB3R booking",
        description: "Existing appointment, arriving now",
        binding: "kiosk /check-in · PATCH /api/appointments/:id/arrive",
        exit: exit("ExitW002", "Checked in", "Present and confirmed at the shop", "appointment arrival truth · barber notification"),
        gates: ["Name / code lookup", "Appointment matched", "Arrival marked", "Barber notified"]
      },
      {
        code: "DoorW004",
        title: "Check in — external booking",
        description: "External-platform guest at the door",
        binding: "kiosk /check-in · POST /api/chairsync/check-in",
        exit: exit("ExitW002", "Checked in", "Present and confirmed at the shop", "external money untouched · queue position issued"),
        gates: ["External import matched", "External money untouched", "Queue position issued", "ClientBridge offer staged"]
      },
      {
        code: "DoorW005",
        title: "Book at the barber kiosk",
        description: "One chair, that barber’s prices",
        binding: "kiosk (barber) · POST /api/bookings",
        exit: exit("ExitW001", "Walk-in assigned", "Assigned to a barber, placed in the line", "canonical booking and queue truth"),
        gates: ["Barber kiosk entry", "Service picked · own prices", "Payment intention taken", "Confirmed · celebration"]
      },
      {
        code: "DoorW006",
        title: "Schedule for later",
        description: "Walk-in books a future slot",
        binding: "kiosk /schedule-ahead · POST /api/bookings",
        exit: exit("ExitW003", "Scheduled ahead", "Future slot held, reminders armed", "appointment scheduled · reminder queued"),
        gates: ["Day picked", "Slot held", "Wait math recalibrating", "Reminder scheduled"],
        prototypeReviewGate: 2
      }
    ]
  },
  {
    id: "clients",
    label: "Clients",
    district: "Client District",
    loop: "Loops into: cut → review → rebook",
    color: "#D9B461",
    laneIds: ["operations", "product"],
    doors: [
      {
        code: "DoorC001",
        title: "Search → book new",
        description: "Client hunts for the right chair",
        binding: "/search → /barber/[handle] · POST /api/bookings",
        exit: exit("ExitC001", "Appointment confirmed", "Stripe truth + both calendars agree", "appointment confirmed · captured payment when required"),
        gates: ["Search", "Barber profile", "Service + time picked", "Policy accepted", "Stripe confirmed"]
      },
      {
        code: "DoorC002",
        title: "Rebook a previous barber",
        description: "The loyalty path",
        binding: "/appointments → rebook · POST /api/bookings",
        exit: exit("ExitC002", "Rebooked", "Same barber, one tap", "appointment inserted · source rebook"),
        gates: ["Last cut opened", "Same service preloaded", "Slot confirmed"]
      },
      {
        code: "DoorC003",
        title: "Reschedule upcoming",
        description: "Life moved; the cut moves too",
        binding: "/appointments/[id] · PATCH /api/bookings/:id",
        exit: exit("ExitC003", "Rescheduled", "New time, everyone notified", "appointment time updated · both participants notified"),
        gates: ["Upcoming opened", "New time picked", "Barber notified", "Updated everywhere"]
      },
      {
        code: "DoorC004",
        title: "Cancel upcoming",
        description: "Exit with money truth intact",
        binding: "/appointments/[id]/cancel · POST /api/refunds",
        exit: exit("ExitC004", "Canceled · refund truth", "Rule shown first, refund symmetric", "refund evidence · ledger reversal"),
        gates: ["Cancel opened", "Refund rule shown first", "Refund issued", "Both ledgers updated"]
      },
      {
        code: "DoorC005",
        title: "Review a completed cut",
        description: "Stars, words, and proof",
        binding: "/appointments/[id]/review · POST /api/reviews",
        exit: exit("ExitC005", "Review published", "Moderation passed, profile updated", "review published · rating recalculated"),
        gates: ["Completed cut opened", "Stars + words", "Safety pass", "Published to profile"]
      },
      {
        code: "DoorC006",
        title: "Book from a Culture post",
        description: "The feed sells the chair",
        binding: "/culture/[post] · POST /api/bookings?src=culture",
        exit: exit("ExitC006", "Booked from Culture", "Post → chair, fully attributed", "appointment inserted · Culture attribution"),
        gates: ["Culture post opened", "Featured barber", "Book from post", "Confirmed · attributed"]
      }
    ]
  },
  {
    id: "barbers",
    label: "Barbers",
    district: "Barber District",
    loop: "Loops into: earnings → rebook link → more cuts",
    color: "#8CC8FF",
    laneIds: ["operations", "finance"],
    doors: [
      {
        code: "DoorB001",
        title: "Home → next client",
        description: "Barber opens the day",
        binding: "/pro/home · PATCH /api/queue/advance",
        exit: exit("ExitB001", "Next client seated", "Queue advanced, chair filled", "queue advanced · client notification"),
        gates: ["Queue loaded", "Next client card", "“You’re up” text sent"]
      },
      {
        code: "DoorB002",
        title: "Calendar → manage a cut",
        description: "Move, extend, or adjust",
        binding: "/pro/calendar · PATCH /api/bookings/:id",
        exit: exit("ExitB002", "Calendar updated", "Client agreed, everywhere synced", "booking updated · calendars synchronized"),
        gates: ["Appointment opened", "Time adjusted", "Client agreed", "Everywhere updated"]
      },
      {
        code: "DoorB003",
        title: "Checkout → complete service",
        description: "The money moment",
        binding: "/pro/checkout · POST /api/checkout/capture",
        exit: exit("ExitB003", "Service completed · paid", "Ledger + rent moved atomically", "checkout captured · routing and rent evidence"),
        gates: ["Service total", "Tip — 100% yours", "Stripe captured", "Ledger + rent atomic"]
      },
      {
        code: "DoorB004",
        title: "Money → payout readiness",
        description: "Understand the financial position",
        binding: "/pro/money · GET /api/payouts/summary",
        exit: exit("ExitB004", "Payout ready", "Friday run armed, traceable", "payout readiness · release remains controlled"),
        gates: ["Native earnings loaded", "External kept separate", "Fees + rent applied", "Payout readiness"]
      },
      {
        code: "DoorB005",
        title: "Enable AutoBooth",
        description: "Rent that pays itself",
        binding: "/pro/rent/autobooth · POST /api/rent/autobooth",
        exit: exit("ExitB005", "AutoBooth active", "Five gates armed, server-side", "AutoBooth relationship active"),
        gates: ["Owner offer found", "Terms reviewed", "Owner approval pending", "Gates armed"],
        prototypeReviewGate: 2
      },
      {
        code: "DoorB006",
        title: "Shop invitation review",
        description: "Join a floor, keep your business",
        binding: "/pro/invites/[id] · PATCH /api/team/invites/:id",
        exit: exit("ExitB006", "Invitation answered", "Relationship truth recorded", "team relationship and eligibility synchronized"),
        gates: ["Invitation opened", "Rent terms read", "Accepted", "Chair eligibility live"]
      }
    ]
  },
  {
    id: "shop_owner",
    label: "Shop Owner",
    district: "Shop Owner District",
    loop: "Loops into: capture → repeat visits → growth",
    color: "#C9A87C",
    laneIds: ["operations"],
    doors: [
      {
        code: "DoorS001",
        title: "Team → add a barber",
        description: "Grow the floor",
        binding: "/shop/team/invite · POST /api/team/invites",
        exit: exit("ExitS001", "Barber on the team", "Permissions + eligibility live", "team membership active · permissions applied"),
        gates: ["Invite created", "Barber accepts", "Permissions applied", "Eligibility recalculated"]
      },
      {
        code: "DoorS002",
        title: "Activate the shop kiosk",
        description: "Open the front door",
        binding: "/shop/kiosk · PATCH /api/kiosk/device",
        exit: exit("ExitS002", "Kiosk live", "Front door open, policies applied", "kiosk session live · policies applied"),
        gates: ["Device paired", "PIN + privacy set", "Entry paths chosen", "Kiosk live"]
      },
      {
        code: "DoorS003",
        title: "Configure rotation",
        description: "Fair-order walk-in routing",
        binding: "/shop/kiosk/rotation · PATCH /api/kiosk/rotation",
        exit: exit("ExitS003", "Rotation set", "Fair order, honest waits", "rotation rules and wait math live"),
        gates: ["Fair-order rules", "Wait math tuned", "Preview on floor", "Rotation live"]
      },
      {
        code: "DoorS004",
        title: "Review booth rent",
        description: "The floor’s rent week",
        binding: "/shop/rent · GET /api/rent/week",
        exit: exit("ExitS004", "Rent reconciled", "$0.00 across both ledgers", "rent week residual $0.00 · mirrored"),
        gates: ["Week loaded", "Contributions itemized", "$0.00 reconciled", "Statement mirrored"]
      },
      {
        code: "DoorS005",
        title: "Resolve a queue alert",
        description: "A chair fell behind",
        binding: "/shop/floor · PATCH /api/queue/reassign",
        exit: exit("ExitS005", "Alert resolved", "Floor rebalanced, audited", "cash-only reassignment · audit written"),
        gates: ["Alert opened", "Barber behind", "Reassign — cash walk-ins only", "Floor rebalanced"],
        prototypeReviewGate: 1
      },
      {
        code: "DoorS006",
        title: "Offer AutoBooth",
        description: "Rent policy for the team",
        binding: "/shop/rent/autobooth · POST /api/rent/offers",
        exit: exit("ExitS006", "AutoBooth offered", "Awaiting barber acceptance", "rent offer pending acceptance"),
        gates: ["Policy drafted", "Cap + cash rules", "Offer sent", "Barber acceptance pending"]
      }
    ]
  },
  {
    id: "money",
    label: "Money",
    district: "Payment District",
    loop: "Loops into: cut → settle → payout → reconcile",
    color: "#9BE15D",
    laneIds: ["finance"],
    doors: [
      {
        code: "DoorM001",
        title: "Client pays for a cut",
        description: "The native card moment",
        binding: "Stripe payment_intent.succeeded · ledger.insert",
        exit: exit("ExitM001", "Payment settled", "Stripe truth + ledger written", "native payment settled · fee routing recorded"),
        gates: ["Checkout total", "Stripe capture", "Ledger written", "Fee — native only", "AutoBooth share moved"]
      },
      {
        code: "DoorM002",
        title: "Cash settled at the chair",
        description: "Cash truth, never early",
        binding: "POST /api/checkout/cash · payouts.pending",
        exit: exit("ExitM002", "Cash truth recorded", "Never shown settled early", "cash pending then settled at service end"),
        gates: ["Barber confirms cash", "Marked pending", "Friday deduction queued", "Settled + receipt"]
      },
      {
        code: "DoorM003",
        title: "Barber payout run",
        description: "Friday, on time, on amount",
        binding: "cron Friday · POST /api/payouts/run",
        exit: exit("ExitM003", "Payout landed", "Traceable to every transaction", "transfers paid · trace complete"),
        gates: ["Run opens", "Transactions traced", "Rent share moved", "Bank transfer sent"]
      },
      {
        code: "DoorM004",
        title: "Refund request",
        description: "Exit with symmetry",
        binding: "POST /api/refunds · ledger.reverse",
        exit: exit("ExitM004", "Refund symmetric", "All balances moved together", "refund succeeded · routing reversed"),
        gates: ["Rule shown first", "Refund issued", "Contribution reversed", "Both ledgers agree"]
      },
      {
        code: "DoorM005",
        title: "Dispute opened",
        description: "Frozen, not vanished",
        binding: "Stripe charge.dispute.created · funds.hold",
        exit: exit("ExitM005", "Dispute resolved", "Held, ruled, then unwound honestly", "dispute under review · funds frozen"),
        gates: ["Chargeback received", "Funds held — including share", "Evidence submitted", "Ruling applied"],
        prototypeReviewGate: 1
      },
      {
        code: "DoorM007",
        title: "Gifted cut redeemed",
        description: "Community pool pays the chair",
        binding: "POST /api/gifts/redeem · pool.debit · barber paid full price",
        exit: exit("ExitM001", "Payment settled", "Stripe truth + ledger written", "gift pool debited · barber paid full price"),
        gates: ["Offer shown at payment", "Client accepts", "Pool debited — Stripe", "Barber paid full price"]
      },
      {
        code: "DoorM006",
        title: "Rent week reconciliation",
        description: "The $0.00 ceremony",
        binding: "cron Sunday · GET /api/rent/reconcile",
        exit: exit("ExitM006", "Reconciled to $0.00", "Both ledgers + Stripe agree", "rent week closed · zero residual"),
        gates: ["Statements mirrored", "Stripe cross-check", "$0.00 residual", "Week certified"]
      }
    ]
  },
  {
    id: "hive_ai",
    label: "Hive AI",
    district: "The Hive",
    loop: "Loops into: observe → suggest → human approves → learn",
    color: "#BFA6FF",
    laneIds: ["product", "technology"],
    doors: [
      {
        code: "DoorA001",
        title: "Hive reads the queue",
        description: "Wait math, honestly posted",
        binding: "cron */2min · hive.predictWait() · queue snapshot read-only",
        exit: exit("ExitA001", "Honest wait posted", "Kiosk + TV updated together", "wait estimate written · subscribed surfaces updated"),
        gates: ["Queue snapshot", "Wait model runs", "Prediction written", "Kiosk + TV updated"]
      },
      {
        code: "DoorA002",
        title: "Hive drafts rebook nudges",
        description: "Draft only — humans send",
        binding: "cron daily · hive.draftNudges() · POST /api/hive/drafts",
        exit: exit("ExitA002", "Nudge approved", "A human sent it — AI only drafted", "draft approved by a human"),
        gates: ["Overdue clients scanned", "Consent + caps checked", "Draft for the barber", "Barber approves"]
      },
      {
        code: "DoorA003",
        title: "Hive balances the floor",
        description: "Suggestions, never seizures",
        binding: "queue watcher · hive.suggestRebalance() · POST /api/hive/suggestions",
        exit: exit("ExitA003", "Suggestion accepted", "Owner confirmed the rebalance", "suggestion accepted · owner changed rotation"),
        gates: ["Imbalance seen", "Rotation suggestion", "Owner confirms", "Floor rebalanced"]
      },
      {
        code: "DoorA004",
        title: "Hive watches the money walls",
        description: "Canary queries, every deploy",
        binding: "deploy hook · hive.runCanaries() · SELECT-only probes",
        exit: exit("ExitA004", "Walls verified", "Money isolation proven again", "canary pass · isolation certificate"),
        gates: ["Canaries run", "Isolation probed", "Zero leaks found", "Certificate stamped"]
      },
      {
        code: "DoorA005",
        title: "Hive flags an anomaly",
        description: "Pattern breaks → human eyes",
        binding: "anomaly watcher · hive.flag() · POST /api/hive/incidents",
        exit: exit("ExitA005", "Anomaly closed", "Reviewed, resolved, learned", "incident resolved · pattern retained"),
        gates: ["Pattern breaks", "Incident drafted", "Human review", "Resolved + learned"],
        prototypeReviewGate: 1
      },
      {
        code: "DoorA006",
        title: "Hive learns the shop",
        description: "The week, digested",
        binding: "cron Sunday · hive.digestWeek() · POST /api/hive/insights",
        exit: exit("ExitA006", "Insight published", "Plain language, in analytics", "insight published to analytics"),
        gates: ["Week digested", "Insights computed", "Plain-language notes", "Surfaced in analytics"]
      }
    ]
  },
  {
    id: "core",
    label: "Core",
    district: "The Core Grid",
    loop: "Loops into: deploy → verify → observe → harden",
    color: "#F5F1E8",
    laneIds: ["technology", "security"],
    doors: [
      {
        code: "DoorX001",
        title: "Sign-in / session",
        description: "Every request proves who it is",
        binding: "middleware auth · Supabase session",
        exit: exit("ExitX001", "Session trusted", "Role-scoped, rotating, never leaked", "role-scoped session issued"),
        gates: ["Credentials verified", "Role scope attached", "Session issued"]
      },
      {
        code: "DoorX002",
        title: "Database write path",
        description: "One write, one truth",
        binding: "Supabase insert/RPC · RLS enforced",
        exit: exit("ExitX002", "Write committed", "RLS passed · audit row written", "row committed · audit inserted"),
        gates: ["RLS policy check", "Transaction commit", "Audit row written"]
      },
      {
        code: "DoorX003",
        title: "Stripe webhook ingest",
        description: "Money events enter here",
        binding: "POST /api/webhooks/stripe · signature verify",
        exit: exit("ExitX003", "Webhook processed", "Idempotent · ledger balanced", "event processed once · ledger balanced"),
        gates: ["Signature verified", "Idempotency key", "Ledger applied"]
      },
      {
        code: "DoorX004",
        title: "Realtime fanout",
        description: "Kiosk, TV, apps — one truth",
        binding: "Supabase Realtime · channel broadcast",
        exit: exit("ExitX004", "Clients in sync", "Every surface shows one truth", "fanout acknowledged by connected surfaces"),
        gates: ["Change captured", "Channels notified", "Surfaces updated"]
      },
      {
        code: "DoorX005",
        title: "Scheduled jobs",
        description: "Payout Friday · rent Sunday · reminders",
        binding: "Vercel cron · /api/jobs/*",
        exit: exit("ExitX005", "Job ran on time", "Crons keep their promises", "job run on time · no missed execution"),
        gates: ["Friday payout run", "Sunday rent close", "Reminder drain late"],
        prototypeReviewGate: 2
      },
      {
        code: "DoorX006",
        title: "Deploy pipeline",
        description: "Vercel ships with proof",
        binding: "Vercel deploy hook · canary suite",
        exit: exit("ExitX006", "Deploy verified", "Canaries pass · rollback armed", "deploy ready · validation proof bound"),
        gates: ["Build + typecheck", "Canary probes", "Promote + tag"]
      }
    ]
  }
];

export function cityDoorByCode(code: string) {
  for (const floor of ARCHITECT_CITY_FLOORS) {
    const door = floor.doors.find((candidate) => candidate.code === code);
    if (door) return { floor, door };
  }
  return null;
}
export function emptyDoorState(definition: DoorDefinition): ArchitectCityDoor {
  const gates = definition.gates.map((label, index) => ({
    id: `${definition.code}-G${String(index + 1).padStart(2, "0")}`,
    label,
    status: "needs_review" as const,
    evidence: "Production gate evidence has not been collected."
  }));

  return {
    code: definition.code,
    title: definition.title,
    description: definition.description,
    binding: definition.binding,
    gates,
    exit: definition.exit,
    status: "needs_review"
  };
}
