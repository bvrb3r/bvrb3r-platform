# PR 28 — Authenticated Role Normalization Approval Surface

## Boundary

PR 28 exposes PR 27 approval evidence through an authenticated Architect surface.
It does not normalize or mutate any profile role. PR 29 remains the first execution package.

## Authorization

- The page is inside the protected Architect layout.
- The API independently calls the existing internal-operator guard.
- Authorization derives from protected internal operator access, never auth metadata.
- The service-role client is created only after authorization succeeds.
- Anonymous and ordinary authenticated users cannot reach the service RPC.

## Mutation controls

- POST requires an exact same-origin request.
- The request requires an exact typed confirmation, a reason, and a UUID idempotency key.
- The recorded commit comes from the server deployment environment, not the browser.
- The API records evidence only through the PR 27 service-only RPC.
- The browser never receives service credentials, actor identity, reason content, or profile rows.
- The surface refuses a second decision after evidence exists.
- Responses are private and non-cacheable.

## Truth contract

The surface can show only the redacted PR 27 status and PR 26 aggregate packet:

- total profiles inspected;
- eligible, blocked, manual-review, and no-op counts;
- 10/10 certification result;
- canonical-output and rollback-packet proof;
- approval state and evidence counts;
- exact deployment/evidence commit identifiers;
- explicit execution-disabled and mutation-not-executed flags.

Missing, malformed, stale, or non-certifiable evidence fails closed. It cannot display Pass.

## Forbidden scope

- no profile update;
- no role update;
- no relationship mutation;
- no RLS change;
- no payment, payout, refund, or routing mutation;
- no production execution path;
- no private actor or reason disclosure;
- no PR 29 role-normalization migration.
