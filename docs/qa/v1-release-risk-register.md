# V1 Release Candidate Risk Register

Date: 2026-07-05

This register is part of Roadmap PR #60. It records release candidate risks
without accepting, hiding, or repairing them.

No risk in this register is pre-accepted by the founder.

## Risk Register

| ID | Risk | Status | Evidence | RC impact | Required decision or proof |
| --- | --- | --- | --- | --- | --- |
| RC-001 | PR #57 app-wide empty/loading/failed state pass is parked after RC | Parked Post-RC Item | Founder input: PR #57 decision: Parked Post-RC Item | Needs founder decision | Decide whether this can remain parked for RC |
| RC-002 | True deployed browser E2E is absent | Needs Founder Decision | PR #59 evidence ceiling: Integration/Proxy E2E evidence present; true deployed browser E2E absent. | Blocks recommended RC readiness | Decide whether proxy/integration evidence is enough or require deployed browser E2E |
| RC-003 | Production deployment dashboard proof is not checked by this PR | Needs Evidence | Local route/script exists; live dashboard not checked here | Needs evidence | Verify current production deployment and commit outside this local lock |
| RC-004 | Live environment configuration is not checked by this PR | Needs Evidence | `scripts/release-readiness.mjs` exists; live values are not exposed or verified here | Needs evidence | Run safe environment verification without revealing secrets |
| RC-005 | Live Supabase/RLS production truth is not checked by this PR | Needs Evidence | RLS and Architect evidence tests exist; production state is not mutated or queried here | Needs evidence | Verify live table/policy posture read-only |
| RC-006 | Stripe/provider dashboard posture is not checked by this PR | Needs Evidence | Payment/webhook tests exist; provider dashboard is not checked here | Needs evidence | Verify provider posture read-only and do not trigger money movement |
| RC-007 | Source Vault private-source review remains outside this PR | Needs Evidence | Source Vault metadata exists; private content is not committed | Needs evidence | Complete private-source review or explicitly park it |
| RC-008 | PR #58 real-device QA is founder-reported, not automated by this PR | Recorded Founder Input | Founder input: PR #58 device QA status: Completed on real devices | Evidence record only | Keep founder evidence separate from automated proof |

## Non-Acceptance Rule

None of the risks above are accepted by this PR. Each risk remains open until
the founder explicitly decides it, or new evidence proves it.

## Protected Boundary

This risk register does not authorize:

- production data mutation
- SQL execution
- Supabase migration
- RLS enablement or policy changes
- Stripe, refund, payout, ledger, or routing mutation
- role or entitlement mutation
- booking mutation
- feature work
- AI work
