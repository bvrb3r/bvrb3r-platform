import { createCanonicalOwnerRouteGate } from "@/components/owner-experience/canonical-owner-route-gate";

export default createCanonicalOwnerRouteGate({
  eyebrow: "Shop AI",
  title: "Shop AI remains honestly gated.",
  detail: "The copilot cannot open until its recommendations, permissions, evidence, and failure recovery are production-proven.",
  recoveryHref: "/shop/home",
  recoveryLabel: "Return to Owner Home"
});
