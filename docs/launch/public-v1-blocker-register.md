# Public V1 Blocker Register

Roadmap label: PR #62 - Public V1 Launch Gate

Recommended verdict dependency: PUBLIC V1 NOT READY while any critical blocker
below remains open.

| ID | Blocker / risk | Severity | Status | Owner | Evidence | Required action | Launch impact |
| --- | --- | --- | --- | --- | --- | --- | --- |
| LAUNCH-001 | RC gap closure status is Still open | critical | open | Founder + Architect | Founder input recorded in PR #62 | Close or explicitly accept every PR #60 RC gap | Blocks public launch |
| LAUNCH-002 | Pilot execution status is Not executed | critical | open | Founder + Architect | Founder input recorded in PR #62 | Execute pilot and capture evidence | Blocks public launch |
| LAUNCH-003 | Live Stripe evidence status is Not verified | critical | open | Founder | Founder input recorded in PR #62 | Verify live provider posture without moving money | Blocks public launch |
| LAUNCH-004 | Required policy/legal surfaces are incomplete | critical | founder-action | Founder/legal | Repo policy sweep | Add approved Terms, Privacy, refund, cancellation/no-show, community/content, conduct, support, and data/privacy surfaces | Blocks public launch |
| LAUNCH-005 | True deployed browser E2E remains absent | high | open | Founder + Architect | `docs/qa/v1-release-candidate-lock.md` | Run deployed browser journeys or record founder acceptance of proxy evidence | Blocks or limits public launch |
| LAUNCH-006 | Production deployment dashboard proof is not committed | high | open | Founder + Architect | `docs/qa/v1-release-risk-register.md` | Capture production deployment status and commit as external evidence | Blocks public launch |
| LAUNCH-007 | Live environment configuration is not verified | high | open | Founder | `docs/qa/v1-release-risk-register.md` | Verify required env presence without exposing secrets | Blocks public launch |
| LAUNCH-008 | Live Supabase/RLS production truth is not checked here | high | open | Founder + Architect | `docs/qa/v1-release-risk-register.md` | Verify live table and policy posture read-only | Blocks public launch |
| LAUNCH-009 | Source Vault private-source review remains external | medium | open | Founder | `docs/qa/v1-release-risk-register.md` | Complete or explicitly park private-source review | Blocks if required for launch doctrine |
| LAUNCH-010 | Real support response behavior is not proven | medium | open | Founder + Architect | Support intake tests and PR #61 support escalation | Run support response drill and capture evidence | Blocks if no operational fallback is accepted |
| LAUNCH-011 | Notification delivery provider behavior is not proven | medium | open | Founder + Architect | Notification consent tests and PR #61 scripts | Keep delivery claims out of launch copy or capture provider evidence | Limits notification launch claims |
| LAUNCH-012 | Public launch claim could be unsupported | critical | blocked | Founder + Architect | This gate | Do not make launch claims until this register closes | Blocks public launch |

## Status Vocabulary

- open: evidence or decision is missing.
- blocked: cannot proceed without founder/legal/external action.
- mitigated: evidence shows the risk is closed.
- founder-action: founder or legal owner must act.
- not-applicable: documented reason the item does not apply.

No blocker in this file is marked mitigated unless repo-local evidence or
founder-attested external evidence proves it.
