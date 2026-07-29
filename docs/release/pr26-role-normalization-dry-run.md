# PR 26 — Role Normalization Dry-Run / Approval Packet

## Outcome

PR 26 adds a service-only, aggregate role-normalization approval packet. It reports the current decision counts needed for review while keeping execution disabled.

## Packet contract

The packet reports:

- total inspected, affected, eligible, blocked, manual-review, and no-op counts;
- current and proposed role counts;
- decision counts;
- canonical-output and rollback-packet status;
- ten fail-closed certification checks.

It does not return profile rows, identifiers, names, contact content, or private relationship content.

## Safety boundary

- `approvalRequired=true`
- `executionEnabled=false`
- `rawMutationExecuted=false`
- `rowsIncluded=false`
- `profileContentExposed=false`
- `relationshipMutationAttempted=false`
- service-role access only
- no profile, RLS, money, Stripe, payout, refund, or relationship mutation

PR 26 creates evidence only. Approval persistence and any later execution remain separate packages.
