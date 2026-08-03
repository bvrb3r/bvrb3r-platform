export type DemoRole = "barber" | "owner";

export type DemoMetric = {
  label: string;
  value: string;
  detail: string;
  highlighted?: boolean;
};

export type DemoStep = {
  label: string;
  title: string;
  body: string;
  metrics: readonly DemoMetric[];
};

export type InteractiveDemo = {
  title: string;
  subtitle: string;
  signupHref: "/signup?lane=barber" | "/signup?lane=shop_owner";
  steps: readonly DemoStep[];
};

export const INTERACTIVE_DEMOS: Record<DemoRole, InteractiveDemo> = {
  barber: {
    title: "Run a demo day at the chair",
    subtitle: "A booking arrives, a walk-in hits the kiosk, you check out, and the money lands — the whole loop, in two minutes.",
    signupHref: "/signup?lane=barber",
    steps: [
      {
        label: "Booking arrives",
        title: "A client books you",
        body: "Sample client Marcus books a Designer Cut for 2:00. Watch the sample appointment land on the calendar and both sample confirmations appear.",
        metrics: [
          { label: "Appointment", value: "2:00 PM", detail: "Designer Cut · $40", highlighted: true },
          { label: "Reminder", value: "Demo only", detail: "No texts are sent" },
          { label: "Calendar", value: "Sample sync", detail: "Apple · Google · Square" }
        ]
      },
      {
        label: "Kiosk walk-in",
        title: "Your kiosk takes a walk-in",
        body: "While you cut, the demo kiosk places DeShawn behind Marcus. The wait remains clearly labeled sample data and no real queue entry is created.",
        metrics: [
          { label: "Queue spot", value: "#2", detail: "~40 min · demo status", highlighted: true },
          { label: "Kiosk", value: "Hands-free", detail: "EN · ES · KRE" },
          { label: "Wait math", value: "Sample", detail: "No live chair data" }
        ]
      },
      {
        label: "Checkout",
        title: "The money moment",
        body: "This sample shows a $40 service and $12 tip. The tip stays untouched while a $6 AutoBooth contribution reduces the flat-rent balance.",
        metrics: [
          { label: "Barber keeps", value: "$46.00", detail: "$40 service + $12 tip − $6 rent", highlighted: true },
          { label: "Tip", value: "100% yours", detail: "Never included in rent", highlighted: true },
          { label: "Rent left", value: "$174", detail: "Demo balance only" }
        ]
      },
      {
        label: "The week",
        title: "Friday, in sample numbers",
        body: "Twelve sample cuts, a sample take, and an auditable sample receipt trail show how the operating week can close without creating any real records.",
        metrics: [
          { label: "Week", value: "$520", detail: "Demo pace × sample prices", highlighted: true },
          { label: "Payout", value: "Friday", detail: "Sample Stripe state" },
          { label: "Earnings split", value: "$0", detail: "Fixed rent only", highlighted: true }
        ]
      }
    ]
  },
  owner: {
    title: "Run a demo day on the floor",
    subtitle: "Three chairs, a kiosk, a TV, and rent that reconciles itself — the owner loop, in two minutes.",
    signupHref: "/signup?lane=shop_owner",
    steps: [
      {
        label: "The floor",
        title: "Morning — floor day opens",
        body: "Three sample barbers, 18 sample bookings, and a demo kiosk show the live-floor posture without touching a real shop.",
        metrics: [
          { label: "Chairs", value: "3 / 3 claimed", detail: "Sample agreements", highlighted: true },
          { label: "Today", value: "18 booked", detail: "+ demo walk-ins" },
          { label: "TV", value: "15 scenes", detail: "Demo rotation" }
        ]
      },
      {
        label: "Walk-ins flow",
        title: "The kiosk keeps chairs visible",
        body: "The demo routes sample walk-ins to next available or a selected barber, with fair-order and wait labels that never create a real booking.",
        metrics: [
          { label: "Kiosk today", value: "9 walk-ins", detail: "Sample conversion only", highlighted: true },
          { label: "Rotation", value: "Fair order", detail: "Shortest eligible line first" },
          { label: "Front desk", value: "Optional", detail: "Demo posture" }
        ]
      },
      {
        label: "Rent runs itself",
        title: "AutoBooth does the collecting",
        body: "Sample eligible service transactions contribute toward flat rent, capped at the remaining balance. Tips remain private and untouched.",
        metrics: [
          { label: "This week", value: "$915 / $1,300", detail: "3 sample chairs on AutoBooth", highlighted: true },
          { label: "Chasing", value: "None", detail: "Stops at zero", highlighted: true },
          { label: "Barber money", value: "Private", detail: "Owner sees rent, not earnings" }
        ]
      },
      {
        label: "The close",
        title: "Sunday — $0.00",
        body: "Both sample ledgers agree to the cent. Reports remain demo previews and nothing is exported or stored.",
        metrics: [
          { label: "Reconciled", value: "$0.00", detail: "Sample ledgers agree", highlighted: true },
          { label: "Reports", value: "11 packs", detail: "Preview only" },
          { label: "Earnings split", value: "$0", detail: "Fixed rent only", highlighted: true }
        ]
      }
    ]
  }
};

export function parseDemoRole(value: string | string[] | undefined): DemoRole {
  return value === "owner" ? "owner" : "barber";
}
