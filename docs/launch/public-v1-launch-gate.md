# Public V1 Launch Gate

Roadmap label: PR #62 - Public V1 Launch Gate

Recommended verdict (Recommended - pending founder authorization): PUBLIC V1 NOT READY

This gate does not launch the app. It records repo-local evidence, founder inputs,
and external evidence gaps so the founder can make the final launch decision.

## Expected First-Run Context

- PR #60 recommended RC verdict: NOT RC READY
- PR #61 pilot readiness: PILOT PACKAGE READY — EXECUTION PENDING RC EVIDENCE
- PR #61 honest line: V1 is not public launch ready; pilot execution is gated on RC evidence closure.
- PR #61 money guardrail: Pilot test accounts must never be connected to live Stripe payment movement.
- PR #57 decision: Parked Post-RC Item
- PR #58 device QA: Completed on real devices
- PR #59 evidence tier: Integration/Proxy E2E only

## Founder Inputs Recorded Verbatim

| Input | Value | Launch meaning |
| --- | --- | --- |
| RC gap closure status | Still open | Critical RC gaps carry forward. |
| Pilot execution status | Not executed | Public launch cannot rely on pilot proof. |
| Live Stripe evidence status | Not verified | Live money readiness is incomplete. |

## Committed Evidence Intake

No `docs/evidence/**` directory was present during this sprint. No committed
founder-attested external evidence was available to close external gaps.

## App Health Scorecard

| Gate | Evidence | Status | Blocker? | Notes |
| --- | --- | --- | --- | --- |
| Lint | `npm run lint` | Verified | No | Local command passed. |
| Typecheck | `npm run typecheck` | Verified | No | Local command passed. |
| Build | `npm run build` | Verified | No | Local production build passed. |
| PR #59 regression pack | `tests/unit/v1-end-to-end-regression-pack.spec.ts` | Verified | No | Local proxy/integration proof only. |
| PR #58 mobile/PWA | Mobile and PWA unit suites | Verified locally | Needs Evidence | Founder-reported real-device evidence exists, but this PR did not automate devices. |
| Deployed browser journeys | PR #60 risk register | Needs Evidence | Yes | True deployed browser E2E remains absent. |
| Production deployment dashboard | PR #60 risk register | Needs Evidence | Yes | External verification required. |

## Role Readiness Scorecards

### Client

| Gate | Evidence | Status | Blocker? | Notes |
| --- | --- | --- | --- | --- |
| Onboarding | `tests/unit/onboarding-final-activation*.spec.*` | Verified locally | No | Local proxy evidence only. |
| Booking | Booking unit and route suites | Verified locally | No | Does not replace deployed browser proof. |
| Messages | `tests/unit/client-messages-screen.spec.tsx`, `tests/unit/messages-routes.spec.ts` | Verified locally | No | Local route/UI evidence. |
| Support | Support intake route and service tests | Verified locally | Needs Evidence | Real support response behavior remains external-open. |
| Policy links | Repo policy sweep | Blocker | Yes | Required policy surfaces are not complete in repo evidence. |

### Barber

| Gate | Evidence | Status | Blocker? | Notes |
| --- | --- | --- | --- | --- |
| Onboarding | Barber onboarding and final activation tests | Verified locally | No | Local proxy evidence only. |
| Schedule and completion | Booking/completion regression suites | Verified locally | No | Payout release remains separate. |
| Checkout posture | Payment and booking tests | Verified locally | Needs Evidence | Live provider posture remains external-open. |
| Support and settings | Support/settings paths inspected | Verified locally | Needs Evidence | Real response behavior not locally proven. |
| Policy links | Repo policy sweep | Blocker | Yes | Required policy surfaces are not complete in repo evidence. |

### Shop Owner

| Gate | Evidence | Status | Blocker? | Notes |
| --- | --- | --- | --- | --- |
| Onboarding | Owner onboarding and final activation tests | Verified locally | No | Local proxy evidence only. |
| Schedule/money/settings | Owner routes and paywall tests | Verified locally | Needs Evidence | Live money/provider posture remains external-open. |
| Team/kiosk posture | Kiosk and role tests | Verified locally | Needs Evidence | Real shop pilot proof is not executed. |
| Support | Support intake route and service tests | Verified locally | Needs Evidence | Real support response behavior remains external-open. |
| Policy links | Repo policy sweep | Blocker | Yes | Required policy surfaces are not complete in repo evidence. |

## Money / Trust Scorecard

| Gate | Evidence | Status | Blocker? | Notes |
| --- | --- | --- | --- | --- |
| No fake payment success | Booking and payment negative-path suites | Verified locally | No | Local tests cover safe failures. |
| Webhook posture | `tests/unit/fintech-webhook-service.spec.ts`, `tests/unit/stripe-webhook-entitlements.spec.ts` | Verified locally | Needs Evidence | Live webhook dashboard posture remains external-open. |
| Checkout posture | Booking and payment route tests | Verified locally | Needs Evidence | Live provider dashboard is not locally verified. |
| Refund/cancellation/no-show policy | Policy sweep and booking acknowledgement | Blocker | Yes | Legal/policy documents are not complete. |
| Payout/ledger/routing posture | Finance/payment tests and PR #60 risk register | Needs Evidence | Yes | Live provider and production data posture remain external-open. |
| Test-account isolation | `docs/pilot/test-account-protocol.md` | Verified locally | No | Test accounts must not touch live money movement. |
| Live Stripe evidence | Founder input | Blocker | Yes | Founder input says Not verified. |

## Paywall / Subscription Scorecard

| Gate | Evidence | Status | Blocker? | Notes |
| --- | --- | --- | --- | --- |
| Client paywall | `tests/unit/paywall-entitlement-regression.spec.tsx` | Verified locally | No | Server truth controls entitlement. |
| Barber paywall | Barber paywall regression coverage in repo | Verified locally | No | Local evidence only. |
| Shop Owner paywall | Shop owner paywall regression coverage in repo | Verified locally | No | Local evidence only. |
| Subscription settings | `tests/unit/subscription-settings.spec.tsx` | Verified locally | No | Local evidence only. |
| Live entitlement/provider state | Founder input / no committed evidence | Needs Evidence | Yes | External proof required before launch. |

## Support / Notification Scorecard

| Gate | Evidence | Status | Blocker? | Notes |
| --- | --- | --- | --- | --- |
| Support intake | `lib/support/issue-intake.ts`, route tests | Verified locally | No | Creates support thread/message and event in local test path. |
| Manual fallback | `docs/pilot/support-escalation.md` | Verified locally | Needs Evidence | Real response behavior remains external-open. |
| Notification consent | `tests/unit/notification-consent.spec.ts` | Verified locally | No | Consent posture only. |
| Notification delivery | PR #61 scripts and inspection | Needs Evidence | No | Delivery must not be promised from consent alone. |

## Policy Readiness Scorecard

| Policy | Repo path or status | Status | Owner | Launch impact |
| --- | --- | --- | --- | --- |
| Terms | ABSENT | Blocker | Founder/legal | Required before public launch. |
| Privacy | ABSENT | Blocker | Founder/legal | Required before public launch. |
| Refund/dispute | ABSENT | Blocker | Founder/legal | Required before public launch. |
| Cancellation/no-show | Booking acknowledgement exists; full policy ABSENT | Blocker | Founder/legal | Required before public launch. |
| Community/content | ABSENT | Blocker | Founder/legal | Required before public launch. |
| Barber/shop/client conduct | ABSENT | Blocker | Founder/legal | Required before public launch. |
| Support policy | Support escalation exists; formal policy ABSENT | Needs Evidence | Founder/legal | Required before public launch. |
| Data/privacy disclosure | ABSENT | Blocker | Founder/legal | Required before public launch. |

No policy text is authored by this gate.

## Pilot Evidence Status

| Gate | Evidence | Status | Blocker? | Notes |
| --- | --- | --- | --- | --- |
| Pilot package | `docs/pilot/**` | Verified locally | No | Package exists. |
| RC gap closure | Founder input | Blocker | Yes | Still open. |
| Pilot execution | Founder input | Blocker | Yes | Not executed. |
| Evidence capture checklist | `docs/pilot/evidence-capture-checklist.md` | Verified locally | No | Capture plan exists. |
| Test account protocol | `docs/pilot/test-account-protocol.md` | Verified locally | No | Test-mode-only guardrail exists. |

## Critical Blocker Table

| Blocker | Severity | Owner | Evidence | Required action |
| --- | --- | --- | --- | --- |
| RC gaps still open | Critical | Founder + Architect | Founder input | Close or explicitly accept every RC gap. |
| Pilot not executed | Critical | Founder + Architect | Founder input | Execute pilot and record evidence. |
| Live Stripe evidence not verified | Critical | Founder | Founder input | Verify live provider posture without moving money. |
| Required policies incomplete | Critical | Founder/legal | Repo policy sweep | Add approved legal/policy surfaces. |
| No committed external evidence | High | Founder + Architect | Missing `docs/evidence/**` | Commit attested external evidence or keep gaps open. |
| Deployed browser E2E absent | High | Founder + Architect | PR #60 | Run deployed browser journeys or accept the limitation. |
| Live Supabase/RLS production truth open | High | Founder + Architect | PR #60 | Verify read-only production truth. |

## Public Launch Claim Rule

No public launch claim may be made from this gate. Honest negations and the
exact recommended verdict value are allowed. The founder must finalize the
decision after critical evidence closes.

## Go / No-Go Rule

Public V1 can move forward only when:

1. No critical blocker remains open.
2. App health, onboarding, booking, support, paywall, role/RLS, and policy gates close with evidence.
3. Live money and provider posture are closed by founder input or committed evidence.
4. Pilot execution evidence exists or is explicitly accepted as non-blocking.
5. Founder authorization is recorded.

Current result: NO-GO.

## Founder Decision Section

Founder final decision: Pending.

Founder must either:

- keep this gate at PUBLIC V1 NOT READY, or
- provide explicit evidence that closes every critical blocker before changing the recommended verdict.

## Next Actions

1. Close PR #60 RC gaps or record explicit founder acceptance.
2. Execute the real shop pilot and capture evidence.
3. Verify live Stripe/provider posture without money movement.
4. Verify production deployment, environment, Supabase/RLS, and Source Vault external evidence.
5. Add approved policy/legal surfaces.
6. Re-run this gate.
