# Manual QA Checklist

## Execution record

- Date: 2026-03-10
- Environment: local production build smoke on `http://127.0.0.1:3001`
- Automated smoke executed: yes
- Smoke routes returning `200`: `/`, `/discover`, `/barber/wave`, `/booking/new`, `/dashboard/client`, `/dashboard/barber`, `/dashboard/front-desk`, `/dashboard/manager`, `/dashboard/owner`, `/manifest.webmanifest`, `/sw.js`, `/api/mobile/deep-links`, `/api/mobile/native/bootstrap`, `/api/mobile/push/subscriptions`, `/api/mobile/native/tokens`, `/api/engagement/deliveries`
- Human browser/staging walkthrough executed: no
- Release note: this checklist still requires human completion in a real browser before production release

## Environment

- [ ] `.env.local` matches the intended release mode (`demo` or `supabase`)
- [ ] `npm install` completed without errors
- [x] `npm run lint` passes
- [x] `npm run typecheck` passes
- [x] `npm run test` passes
- [x] `npm run build` passes

## Core six-step workflow

- [ ] Client can open `/booking/new` on mobile width without layout issues
- [ ] Client can create an appointment and receives a confirmation state
- [ ] Front desk can find the new appointment and check the client in
- [ ] Barber can move the same appointment from checked in to in service
- [ ] Barber can complete the service and the appointment becomes checkout-ready
- [ ] Front desk can capture remaining payment and tip from the checkout panel
- [ ] Freelance barber view updates payout metrics after checkout
- [ ] Booth-rent barber view updates rent-coverage metrics after checkout
- [ ] Owner dashboard revenue, tips, outstanding balance, and activity feed update after checkout
- [ ] Workflow persistence status shows `synced` in Supabase mode or `demo` in quick-start mode

## Role and permission checks

- [ ] Owner can access dashboards, reports, settings, and multi-location views
- [ ] Manager can access operational dashboards and reports but not owner-only controls
- [ ] Front desk can manage appointments and checkout without owner-only financial settings
- [ ] Freelance barber only sees personal schedule and own earnings data
- [ ] Booth-rent barber only sees personal bookings and rent-focused metrics
- [ ] Client only sees booking and personal dashboard routes

## Payments, persistence, and delivery

- [ ] Deposit intent endpoint responds in the configured payment mode
- [ ] Saved payment method setup endpoint responds in the configured payment mode
- [ ] Live operations APIs persist appointments, workflow events, compensation snapshots, and owner analytics in Supabase mode
- [ ] Realtime subscriptions refresh front desk, barber, manager, and owner views in Supabase mode
- [ ] Conflict messaging appears when simultaneous edits are attempted from different roles
- [ ] `/api/mobile/push/subscriptions` persists device activation state correctly
- [ ] `/api/mobile/native/tokens` persists hashed APNs or FCM bridge state correctly
- [ ] `/api/engagement/deliveries` surfaces delivery health and retry metadata correctly

## Responsive and regression checks

- [ ] Landing page remains visually polished on phone and desktop widths
- [x] Core routes render from the production build without server errors during direct navigation
- [ ] Front desk board remains usable on tablet width
- [ ] Barber dashboard remains usable on phone width
- [ ] No obvious UTF-8 or encoding artifacts appear in UI copy
- [ ] Mobile install, deep-link, offline, and reconnect behavior pass `MOBILE_DEVICE_QA.md`
