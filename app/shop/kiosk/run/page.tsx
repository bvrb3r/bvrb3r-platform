import { createCanonicalOwnerRouteGate } from "@/components/owner-experience/canonical-owner-route-gate";

export default createCanonicalOwnerRouteGate({
  eyebrow: "Shop Kiosk",
  title: "Pair and launch this kiosk from the device console.",
  detail: "A running kiosk requires a server-issued device session bound to the selected shop. Direct unpaired launch is blocked.",
  recoveryHref: "/shop/kiosk",
  recoveryLabel: "Open kiosk settings"
});
