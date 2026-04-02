# Release Certification Checklist

## Release metadata

- Release version: `0.8.3`
- Release date: `2026-03-10`
- Environment: local production build smoke plus code/build verification
- Release owner: Codex milestone implementation pass

## Engineering gate

- [ ] Schema migrations applied successfully in a live Supabase environment
- [ ] Local or staging Supabase credentials verified
- [x] `npm run lint` passed on release candidate
- [x] `npm run typecheck` passed on release candidate
- [x] `npm run test` passed on release candidate
- [x] `npm run build` passed on release candidate
- [x] Local production smoke returned `200` for `/`, `/discover`, `/barber/wave`, `/booking/new`, `/dashboard/client`, `/dashboard/barber`, `/dashboard/front-desk`, `/dashboard/manager`, `/dashboard/owner`, `/manifest.webmanifest`, `/sw.js`, `/api/mobile/deep-links`, `/api/mobile/native/bootstrap`, `/api/mobile/push/subscriptions`, `/api/mobile/native/tokens`, and `/api/engagement/deliveries`

## Workflow certification

- [x] Automated six-step workflow coverage passed for a commission barber
- [x] Automated six-step workflow coverage passed for a booth-rent barber
- [x] Automated owner analytics assertions passed for both certification runs
- [ ] Human browser certification completed in a Supabase-backed environment
- [ ] Compensation snapshots and owner analytics manually confirmed in live Supabase/Postgres

## Mobile distribution readiness

- [ ] Wrapped-native login persistence validated on at least one iPhone and one Android device
- [ ] Push permission flow validated on at least one iPhone and one Android device
- [ ] Deep-link click-through validated for booking, barber profile, discovery, referral, and role-home routes
- [ ] APNs and FCM token bridge requests validated against `/api/mobile/native/tokens`
- [ ] Provider credentials validated for the intended release environment
- [ ] Store screenshots and metadata reviewed against `STORE_LAUNCH_CHECKLIST.md`

## Operational readiness

- [ ] Manual QA checklist executed and signed off by a human reviewer
- [ ] Mobile device QA checklist executed and signed off by a human reviewer
- [ ] Release-candidate certification executed and signed off by a human reviewer
- [ ] Demo credentials reviewed or removed for target environment
- [ ] Stripe mode validated for target environment
- [ ] Supabase storage bucket and RLS verified in target environment
- [ ] Known issues reviewed and accepted by product owner

## Sign-off

- Product: pending
- Engineering: code/build gate passed; human release sign-off pending
- QA: pending human browser, device, and staging walkthrough
- Operations: pending staging readiness review
- Final go/no-go: no-go until human browser/device QA, live Supabase verification, and provider credential validation are complete
