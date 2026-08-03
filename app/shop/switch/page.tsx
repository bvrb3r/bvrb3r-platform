import { createCanonicalOwnerRouteGate } from "@/components/owner-experience/canonical-owner-route-gate";

export default createCanonicalOwnerRouteGate({
  eyebrow: "Multi-location",
  title: "Shop switching is not enabled for this release candidate.",
  detail: "Cross-location membership, role boundaries, and active-shop context must pass before multi-location switching can open.",
  recoveryHref: "/shop/home",
  recoveryLabel: "Return to current shop"
});
