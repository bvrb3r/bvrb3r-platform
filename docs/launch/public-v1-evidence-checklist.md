# Public V1 Evidence Checklist

Roadmap label: PR #62 - Public V1 Launch Gate

Evidence classes:

- local: produced by repo inspection or local commands in this sprint.
- founder-attested: committed under `docs/evidence/**` or provided verbatim by founder input.
- external-open: requires external dashboard, device, or operational evidence not available locally.

| Evidence item | Source | Verifier | Evidence class | Status | What closes it | Launch impact |
| --- | --- | --- | --- | --- | --- | --- |
| Lint | `npm run lint` | Codex | local | Verified | Command passes | Required app-health proof |
| Typecheck | `npm run typecheck` | Codex | local | Verified | Command passes | Required app-health proof |
| Build | `npm run build` | Codex | local | Verified | Command passes | Required app-health proof |
| PR #59 V1 regression pack | `tests/unit/v1-end-to-end-regression-pack.spec.ts` | Codex | local | Verified | Test passes | Local proxy proof only |
| Mobile/PWA suites | PR #58-related unit suites | Codex | local | Verified | Tests pass | Does not replace device dashboard evidence |
| Real-device behavior | PR #60 founder input | Founder | founder-attested | Recorded | Keep or refresh device evidence | Required before broad public rollout |
| Vercel production | Production dashboard | Founder + Architect | external-open | Needs Evidence | Commit dashboard/Architect evidence under `docs/evidence/**` | Blocks public launch |
| Production Supabase | Supabase dashboard/read-only proof | Founder + Architect | external-open | Needs Evidence | Commit read-only table/RLS evidence | Blocks public launch |
| Stripe live dashboard | Stripe dashboard | Founder | external-open | Blocker | Founder verifies posture without moving money | Blocks public launch |
| Stripe Connect/payout dashboard | Stripe dashboard | Founder | external-open | Needs Evidence | Founder verifies payout posture without movement | Blocks money launch |
| Environment secrets presence | Vercel/Supabase/env dashboards | Founder | external-open | Needs Evidence | Confirm presence without exposing values | Blocks launch if missing |
| Real pilot execution | Pilot session evidence | Founder + Architect | external-open | Blocker | Execute pilot and capture evidence | Blocks public launch |
| Real support response behavior | Support drill | Founder + Architect | external-open | Needs Evidence | Submit and resolve test support item | Blocks if fallback is not accepted |
| PR #60 RC gaps | PR #60 docs plus founder input | Founder + Architect | founder-attested | Blocker | Close or accept every RC gap | Blocks public launch |
| PR #61 pilot package | `docs/pilot/**` | Codex | local | Verified | Docs and guard test exist | Required pilot plan proof |
| Test account isolation | `docs/pilot/test-account-protocol.md` | Codex | local | Verified | Test-mode protocol remains present | Blocks pilot if violated |
| Support intake path | `lib/support/issue-intake.ts`, support tests | Codex | local | Verified | Tests pass | Local proof only |
| Notification consent posture | `tests/unit/notification-consent.spec.ts` | Codex | local | Verified | Test passes | Delivery remains external-open |
| Paywall and subscription posture | Entitlement/paywall/subscription tests | Codex | local | Verified | Tests pass | Live provider state remains external-open |
| Policy/legal surfaces | Repo policy sweep | Founder/legal | external-open | Blocker | Approved policy documents exist and are linked | Blocks public launch |

## External Evidence Rule

External items are not locally Verified by this PR. They close only through
founder input or committed evidence under `docs/evidence/**`.
