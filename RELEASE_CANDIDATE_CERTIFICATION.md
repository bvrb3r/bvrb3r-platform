# Release Candidate Certification

Use this checklist before cutting a wrapped-native or installable production release candidate.

## Certification record

- Date: 2026-03-10
- Release candidate version: `0.8.3-rc1`
- Environment: pending human staging validation
- Automation gate: passed (`lint`, `typecheck`, `test`, `build`)

## Client role

- [ ] Discovery feed renders cleanly on iPhone and Android
- [ ] Public barber profile trust and social proof render correctly
- [ ] Booking flow works from direct open and deep-link open
- [ ] Waitlist join and referral views render correctly
- [ ] Push opt-in and notification click-through behave correctly

## Barber role

- [ ] Barber dashboard renders correctly in PWA and wrapped-native modes
- [ ] Schedule, start service, complete service, and money views behave correctly
- [ ] Growth and verification sections render correctly
- [ ] Follow, review, and booking alerts route correctly from notifications

## Front desk role

- [ ] Front desk board remains usable on tablet width
- [ ] Check-in and checkout flows work with stable session persistence
- [ ] Queue and waitlist states remain clear after reconnect

## Manager role

- [ ] Manager command-center cards render correctly on tablet and phone widths
- [ ] Queue, floor-flow, and approval visibility remain accurate
- [ ] No owner-only settings or financial admin controls leak into manager views

## Owner role

- [ ] Owner dashboard renders correctly with marketplace and monetization summaries
- [ ] Trust, verification, and activation signals remain visible and role-safe
- [ ] Delivery inspection surfaces remain readable and correct

## Trust and safety

- [ ] Public trust badges remain safe and uncluttered
- [ ] Verification status surfaces remain role-safe
- [ ] Safety-report and dispute intake APIs remain reachable and protected

## Monetization and activation

- [ ] Featured and boosted proof surfaces render correctly in discovery and public profiles
- [ ] City rollout and activation summaries remain visible to owner-safe roles only
- [ ] Notification delivery state reflects real provider or placeholder execution accurately

## Mobile, push, and deep links

- [ ] `/api/mobile/native/bootstrap` returns the expected bootstrap contract
- [ ] `/api/mobile/push/subscriptions` records device activation correctly
- [ ] `/api/mobile/native/tokens` records hashed APNs or FCM bridge state correctly
- [ ] `/api/mobile/deep-links` records and normalizes links correctly
- [ ] Wrapped app opens safe routes correctly from notification taps

## Final sign-off

- Product: pending
- Engineering: pending
- QA: pending
- Release decision: pending completion of real-device validation and store-readiness checks
