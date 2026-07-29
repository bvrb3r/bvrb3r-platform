# PR 27 — Production Role Normalization Approval Evidence

## Outcome

PR 27 installs the immutable evidence contract that PR 28's authenticated approval surface will use.

It can append an explicit `approved` or `rejected` decision for the current PR 26 aggregate packet. It cannot enable or execute role normalization.

## Production baseline

PR 26 production certification on merge commit `5736864697adc35ac8c6b617d26fa6d3b0fb987c` reported:

- 27 profiles inspected
- 20 `client_user`
- 6 `barber_user`
- 1 `shop_owner_user`
- 27 no-op rows
- 0 eligible, blocked, manual-review, or affected rows
- 10/10 certifiable safety checks
- execution and raw mutation disabled

The current production outcome is therefore a zero-row approval closure.

## Evidence contract

- The ledger lives in the denied-by-default `private` schema.
- Evidence is keyed by a caller-supplied UUID for deterministic idempotency.
- Each record snapshots the exact server-generated PR 26 packet.
- A reused idempotency key must match every original field or the call fails.
- Update, delete, and truncate are blocked by append-only triggers.
- Direct ledger access is denied even to `service_role`; writes and reads cross security-definer functions only.
- Private actor identity, actor role, and reason never appear in status output.

## Safety boundary

- The recorder rejects a non-certifiable or non-redacted PR 26 packet.
- `approvalRequired=true` remains explicit.
- `executionEnabled=false` and `roleMutationExecuted=false` are permanent PR 27 outputs.
- No `profiles` row, account role, relationship, RLS policy, payment, payout, refund, or Stripe record is mutated.
- PR 27 does not create a public or authenticated approval endpoint.
- PR 28 owns authenticated operator authorization and UX.
- PR 29 remains the first package allowed to propose an eligible-only role update, and it must validate matching approval evidence before execution.

## Release gates

1. Exact-head focused and full test suites.
2. Lint, typecheck, doctrine, tracked-secret scan, production dependency audit.
3. Migration/RLS semantic proofs.
4. Production build and Vercel preview.
5. Isolated staging migration.
6. Transaction-rolled-back evidence write, replay, conflicting replay, immutability, and profile-role fingerprint proof.
7. Exact-head ready-state rerun.
8. Production migration, pending-status validation, and public/runtime smoke.
