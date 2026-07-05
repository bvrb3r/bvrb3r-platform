# V1 Pilot Readiness

Date: 2026-07-05

This document prepares the Soft Launch / Real Shop Pilot package. It does not
authorize pilot execution.

## Recommended Verdict

Recommended pilot readiness verdict (Recommended - pending founder authorization): PILOT PACKAGE READY — EXECUTION PENDING RC EVIDENCE

Execution status: Pending RC evidence closure.

V1 is not public launch ready; pilot execution is gated on RC evidence closure.

## Authority Model

- Codex docs only: prepares the pilot package, validation guard, and gap list.
- Founder: authorizes pilot execution only after reviewing RC evidence.
- Architect: observes pilot evidence and turns findings into follow-up work.
- Shop Owner: participates only after Founder Action creates the pilot shop setup.
- Barber: participates only after Founder Action creates approved pilot accounts.
- Client: participates only in founder-authorized pilot sessions.

## Role Doctrine

- `client_user` is the client account role.
- `barber_user` is the barber account role.
- `shop_owner_user` is the shop owner account role.
- Relationship types are not roles.
- Kiosk is not a role.
- Guest is a browse state.

## PR #60 Facts Carried Forward

- Recommended RC verdict: NOT RC READY
- PR #57 decision: Parked Post-RC Item
- PR #58 device QA status: Completed on real devices
- PR #59 evidence ceiling: Integration/Proxy E2E evidence present; true deployed browser E2E absent.

## RC Gap Closure List

| Gap | Current status | Verifier | Closure definition | Pilot impact |
| --- | --- | --- | --- | --- |
| PR #57 app-wide empty/loading/failed state pass | Parked Post-RC Item | Founder | Founder explicitly accepts parking for pilot or moves the work before pilot execution | Execution remains pending |
| True deployed browser E2E | Needs Founder Decision | Founder + Architect | Founder accepts proxy coverage for pilot or requires deployed browser E2E evidence first | Execution remains pending |
| Production deployment proof | Needs Evidence | Founder + Architect | Current production deployment status and commit are captured without code mutation | Execution remains pending |
| Live environment configuration | Needs Evidence | Founder | Required environment presence is checked without exposing secrets | Execution remains pending |
| Supabase/RLS production truth | Needs Evidence | Founder + Architect | Live table and policy posture is checked read-only | Execution remains pending |
| Stripe/provider posture | Needs Evidence | Founder | Provider posture is checked read-only; no money movement occurs | Execution remains pending |
| Source Vault private-source review | Needs Evidence | Founder | Private-source review is completed or explicitly parked | Execution remains pending |
| PR #58 real-device QA evidence | Recorded Founder Input | Founder | Founder keeps real-device evidence available for review | Evidence record only |

## Pilot Go / No-Go Criteria

Founder applies these criteria before any real-shop pilot session:

1. All RC gaps above are closed or explicitly accepted for pilot scope.
2. No production data is created by Codex.
3. Test accounts use the test account protocol.
4. Stripe TEST MODE ONLY posture is used for all pilot test accounts.
5. In-app support and manual support escalation are both available.
6. Evidence capture destination is known before the session starts.
7. A pause decision owner is named before the session starts.

## Recommended Package Status

The package itself is ready for founder review because it names actors, sequence,
evidence, recovery rules, support paths, and risks. Pilot execution is still
blocked by the PR #60 RC evidence closure list.

## Next Step

Next step: founder review of PR #61 pilot package and RC gap closure list.

The next step is not public launch.
