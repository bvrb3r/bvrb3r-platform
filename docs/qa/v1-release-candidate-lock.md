# Roadmap PR #60 - V1 Release Candidate Lock

Date: 2026-07-05

This PR is an evidence lock only. It adds no user-facing feature, no redesign,
no database change, no provider integration, and no production mutation.

## Scope Boundary

- No production data mutation.
- No SQL execution.
- No Supabase migration.
- No RLS enablement or policy change.
- No Stripe, refund, payout, ledger, or routing mutation.
- No role or entitlement mutation.
- No booking mutation.
- No Source Vault architecture rewrite.
- No notification or support provider work.
- No dependency changes.
- Draft PR only. Founder approval is required before merge.

## Founder Inputs Recorded

- PR #57 decision: Parked Post-RC Item
- Pre-accepted risks: None pre-accepted — surface candidates for founder review
- PR #58 device QA status: Completed on real devices

## Evidence Ceiling

PR #59 evidence ceiling: Integration/Proxy E2E evidence present; true deployed browser E2E absent.

The PR #59 regression pack proves broad proxy coverage through Vitest, React
Testing Library, jsdom, and integration-style workflow checks. It does not prove
a true deployed browser journey against a live deployment.

## Verdicts

Sprint decision: PASS

Recommended RC verdict (Recommended - pending founder finalization): NOT RC READY

V1 is not public launch ready.

## Why The Recommended RC Verdict Is Not RC Ready

- No risk has been pre-accepted by the founder.
- PR #57 is parked after RC and still needs a founder decision for RC impact.
- PR #59 explicitly caps evidence at proxy/integration coverage.
- Current production deployment evidence must be checked outside this local lock.
- Current Supabase/RLS production truth must be checked outside this local lock.
- Current Stripe/provider dashboard posture must be checked outside this local lock.
- Environment variable presence can be checked without exposing secrets, but the
  live deployment values are not verified by this local PR.

## Evidence Inventory

| Area | Evidence found in repo | Current lock status | RC impact |
| --- | --- | --- | --- |
| PR #59 V1 regression pack | `docs/qa/pr59-v1-end-to-end-regression-pack.md`, `tests/unit/v1-end-to-end-regression-pack.spec.ts` | Local proxy evidence connected | Requires founder decision because true deployed browser E2E is absent |
| PR #58 device QA | `docs/qa/pr58-founder-qa-matrix.md`; founder input says completed on real devices | Founder-reported completion recorded | Keep as founder evidence; not automated by this PR |
| Deployment proof | `scripts/verify-deployment.mjs`, `app/api/health/deployment/route.ts` | Local route/script evidence connected | Live deployment dashboard proof still required |
| Release readiness command | `scripts/release-readiness.mjs` | Local command exists | Live env proof still required |
| Onboarding/final activation | Unit and UI tests present | Local proxy evidence connected | Does not replace deployed browser proof |
| Client runtime loop | Client dashboard/search/messages tests present | Local proxy evidence connected | Does not replace real device/browser proof |
| Barber runtime loop | Barber calendar/checkout/completion tests present | Local proxy evidence connected | Does not replace real device/browser proof |
| Shop Owner runtime loop | Owner overview/schedule/money/settings tests present | Local proxy evidence connected | Does not replace real device/browser proof |
| Booking/calendar/completion | Booking form, mutation, workflow, and completion tests present | Local proxy evidence connected | Does not replace live booking proof |
| Payment/webhook/receipt posture | Payment route/domain/webhook tests present | Local proxy evidence connected | Live provider dashboard proof still required |
| Paywall/subscription | Entitlement and subscription tests present | Local proxy evidence connected | Does not replace live entitlement proof |
| Support intake | Support issue tests present | Local proxy evidence connected | Provider delivery evidence remains outside this PR |
| Notification consent | Notification consent tests present | Local proxy evidence connected | Provider delivery evidence remains outside this PR |
| Mobile/PWA | PWA/mobile tests present; founder input says real devices completed | Mixed local plus founder evidence | Keep founder evidence separate from automated proof |
| Kiosk | Route and screen tests present | Local proxy evidence connected | Does not replace deployed device proof |
| Guest/public surfaces | Guest and public profile tests present | Local proxy evidence connected | Does not replace deployed browser proof |
| Messaging | Route and client messages tests present | Local proxy evidence connected | Does not replace deployed browser proof |
| Architect/Mission Control | Mission Control and RLS evidence tests present | Local proxy evidence connected | Production evidence still required before release confidence |
| RLS/server truth | RLS evidence tests present | Local proxy evidence connected | Live Supabase evidence still required |
| Source Vault | Mission Control/source evidence surfaces present | Metadata evidence only | Private source review still required |

## Required RC Gate Before Any Status Upgrade

The recommended verdict can move only after these are reviewed and explicitly
accepted or proven:

1. Founder decides whether PR #57 being parked is acceptable for RC.
2. Founder decides whether PR #59 proxy evidence is enough for RC or requires
   true deployed browser E2E first.
3. Current production deployment proof is checked.
4. Current Supabase/RLS production truth is checked without mutation.
5. Current Stripe/provider posture is checked without mutation.
6. Environment configuration is checked without exposing secrets.
7. Source Vault private-source review is completed or explicitly parked.

## Next Step

Next step: PR #61 Soft Launch / Real Shop Pilot Prep

PR #61 should not begin until the founder reviews this lock, decides whether any
open risks are acceptable for RC, and confirms the exact pilot scope.
