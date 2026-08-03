import { createCanonicalOwnerRouteGate } from "@/components/owner-experience/canonical-owner-route-gate";

export default createCanonicalOwnerRouteGate({
  eyebrow: "ClientBridge",
  title: "ClientBridge reporting needs final evidence.",
  detail: "Only consented, shop-scoped conversion aggregates may appear here. The approved funnel and privacy tests are not complete.",
  recoveryHref: "/shop/home",
  recoveryLabel: "Return to Owner Home"
});
