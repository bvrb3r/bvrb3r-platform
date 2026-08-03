import { createCanonicalOwnerRouteGate } from "@/components/owner-experience/canonical-owner-route-gate";

export default createCanonicalOwnerRouteGate({
  eyebrow: "Owner Analytics",
  title: "Analytics is not production-certified yet.",
  detail: "The approved analytics surface still needs its final shop-scoped metrics, empty states, and evidence checks.",
  recoveryHref: "/shop/reports",
  recoveryLabel: "Open verified reports"
});
