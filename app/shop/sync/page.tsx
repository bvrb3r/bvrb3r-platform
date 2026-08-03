import { createCanonicalOwnerRouteGate } from "@/components/owner-experience/canonical-owner-route-gate";

export default createCanonicalOwnerRouteGate({
  eyebrow: "ChairSync Oversight",
  title: "ChairSync oversight needs provider proof.",
  detail: "Schedule-only provider coverage, conflicts, outages, and money-privacy controls are not yet certified on this route.",
  recoveryHref: "/shop/schedule",
  recoveryLabel: "Open canonical schedule"
});
