# Pilot Risk Register

Date: 2026-07-05

This register tracks pilot risks. It does not accept or close risks by itself.

V1 is not public launch ready; pilot execution is gated on RC evidence closure.

## Risk Register

| ID | Risk | Severity | Status | Owner | Action | Pilot impact |
| --- | --- | --- | --- | --- | --- | --- |
| PILOT-001 | PR #57 remains parked after RC | high | open | Founder | Decide whether this can remain parked for pilot execution | Execution pending |
| PILOT-002 | True deployed browser E2E is absent | high | open | Founder + Architect | Decide whether proxy evidence is sufficient or require deployed browser E2E first | Execution pending |
| PILOT-003 | Production deployment proof not captured in this PR | high | open | Founder + Architect | Capture current deployment status and commit without code mutation | Execution pending |
| PILOT-004 | Live environment configuration not verified here | high | open | Founder | Verify presence without exposing secrets | Execution pending |
| PILOT-005 | Supabase/RLS production truth not checked here | critical | open | Founder + Architect | Verify live posture read-only | Execution pending |
| PILOT-006 | Stripe/provider posture not checked here | critical | open | Founder | Verify provider posture read-only; no money movement | Execution pending |
| PILOT-007 | Source Vault private-source review is incomplete | medium | open | Founder | Complete private-source review or explicitly park | Execution pending |
| PILOT-008 | PR #58 real-device QA is founder-reported, not automated here | medium | mitigated | Founder | Keep real-device evidence available for review | Evidence review required |
| PILOT-009 | Support path could fail during pilot | high | open | Founder + Architect | Use in-app support plus manual fallback | Pause if both paths fail |
| PILOT-010 | Notification delivery could be misunderstood | medium | open | Founder + Architect | Explain consent versus delivery in onboarding scripts | Do not promise delivery |
| PILOT-011 | Test account touches live money | critical | blocked | Founder | Require Stripe TEST MODE ONLY and `TEST-PILOT-` naming | Pilot cannot proceed |

## Founder-Accepted Risk Rule

No risk is marked founder-accepted in this register. Founder acceptance must be
explicitly recorded before any risk can move to founder-accepted.
