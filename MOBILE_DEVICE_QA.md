# Mobile Device QA

Use this checklist for real iPhone, Android, installed PWA, and wrapped-native staging validation.

## Execution record

- Date: 2026-03-10
- Latest automated gate: `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`
- Latest automated smoke: `/`, `/discover`, `/barber/wave`, `/booking/new`, `/dashboard/client`, `/dashboard/barber`, `/dashboard/front-desk`, `/dashboard/manager`, `/dashboard/owner`, `/manifest.webmanifest`, `/sw.js`, `/api/mobile/deep-links`, `/api/mobile/native/bootstrap`, `/api/mobile/push/subscriptions`, `/api/mobile/native/tokens`, `/api/engagement/deliveries`
- Human real-device walkthrough: pending

## Device matrix

- [ ] iPhone Safari PWA install
- [ ] iPhone wrapped-native build
- [ ] Android Chrome PWA install
- [ ] Android wrapped-native build
- [ ] Tablet layout spot-check for front desk and owner views

## Install and first launch

- [ ] Install from Safari and Chrome using the manifest-driven flow.
- [ ] Confirm the app name displays as `BVRB3R Platform`.
- [ ] Confirm icons, splash assets, and safe-area spacing render cleanly.
- [ ] Confirm the first launch lands in the correct shell without clipped headers or dock actions.
- [ ] Confirm `/manifest.webmanifest`, `/sw.js`, `/.well-known/assetlinks.json`, and `/apple-app-site-association` are reachable.

## Session and role checks

- [ ] Client login persists across relaunch and lands on `/dashboard/client`.
- [ ] Commission barber login persists across relaunch and lands on `/dashboard/barber`.
- [ ] Booth-rent barber login persists across relaunch and lands on `/dashboard/barber`.
- [ ] Front desk login persists across relaunch and lands on `/dashboard/front-desk`.
- [ ] Manager login persists across relaunch and lands on `/dashboard/manager`.
- [ ] Owner login persists across relaunch and lands on `/dashboard/owner`.
- [ ] Mobile navigation remains role-safe for every role.

## Deep links and app-open routing

- [ ] Open `/discover` from browser, installed PWA, and wrapped-native context.
- [ ] Open `/barber/wave` from browser, installed PWA, and wrapped-native context.
- [ ] Open `/booking/new` from browser, installed PWA, and wrapped-native context.
- [ ] Open `/referrals` from browser, installed PWA, and wrapped-native context.
- [ ] Open `/dashboard/client`, `/dashboard/barber`, and `/dashboard/owner` through deep-link URLs where safe.
- [ ] Confirm unsafe or malformed routes normalize safely back to `/`.

## Push and notification checks

- [ ] Enable alerts on client, barber, and owner devices.
- [ ] Confirm `/api/mobile/push/subscriptions` records the device subscription state.
- [ ] Confirm `/api/mobile/native/tokens` records APNs or FCM bridge metadata when the runtime is wrapped-native.
- [ ] Confirm `/api/engagement/deliveries` shows delivery-attempt status and provider health.
- [ ] Confirm notification taps route to the intended deep link.
- [ ] Confirm disabling alerts revokes both subscription and native-token state for the device.

## Core role flows on device

- [ ] Client can discover, book, join the waitlist, follow a barber, and manage an appointment.
- [ ] Barber can view schedule, start service, complete service, view money, and inspect verification or growth state.
- [ ] Front desk can check in a client, manage the queue, and complete checkout on tablet width.
- [ ] Manager can review floor flow, queue state, inventory alerts, and command-center cards.
- [ ] Owner can review high-level metrics, trust alerts, and marketplace monetization summaries.

## Offline and reconnect behavior

- [ ] Cached shell and already-viewed discovery surfaces remain visible while offline.
- [ ] Booking, checkout, and live operational writes fail gracefully while offline.
- [ ] Reconnect refreshes the app without duplicate bookings or duplicate push registrations.
- [ ] Offline messaging remains clear and non-technical.

## Wrapped-native validation

- [ ] Wrapped runtime reports the expected bundle or package ids from `/api/mobile/native/bootstrap`.
- [ ] APNs or FCM token registration, refresh, and revoke requests hit `/api/mobile/native/tokens` correctly.
- [ ] Native runtime suppresses the browser install prompt.
- [ ] Capacitor shell opens safe routes without webview navigation issues.

## Sign-off

- QA reviewer: pending
- Device lab: pending
- Release note: do not mark release-ready until this checklist and `RELEASE_CANDIDATE_CERTIFICATION.md` are both complete.
