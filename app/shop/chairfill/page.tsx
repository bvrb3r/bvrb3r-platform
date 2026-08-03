import { createCanonicalOwnerRouteGate } from "@/components/owner-experience/canonical-owner-route-gate";

export default createCanonicalOwnerRouteGate({
  eyebrow: "ChairFill",
  title: "ChairFill remains honestly gated.",
  detail: "Offers and marketplace distribution are outside the verified launch path until targeting, consent, and shop-scoping are complete.",
  recoveryHref: "/shop/chairs",
  recoveryLabel: "Manage chairs"
});
