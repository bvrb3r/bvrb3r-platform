# PR 25 — Role Normalization Migration / Plan

## Outcome

PR 25 freezes a safe, reviewable role-normalization plan without executing a profile-role mutation.

The plan maps only evidence-backed legacy account roles to the three canonical public identities:

- `client` → `client_user` only with a linked client record
- a retired pre-doctrine barber account role → `barber_user` only with a linked barber record
- `owner` → `shop_owner_user` only with an owned-shop record

Operational/internal roles and missing evidence remain blocked for manual review. Relationship economics remain outside `profiles.role`.

## Production preflight

Read-only production evidence on 2026-07-28 showed:

- 27 profiles
- 27 canonical public roles
- 0 eligible legacy-role updates
- 0 blocked or manual-review profile roles
- validated `profiles_canonical_public_role_check`
- historical backup rows retained in the private normalization backup table

This makes the current production outcome a zero-row normalization closure. PR 25 does not claim or perform a role update.

## Safety controls

- The only active SQL in the plan is an aggregate dry-run.
- Update, backup, and rollback bodies remain commented.
- Future backups use the denied-by-default `private` schema.
- No profile identifiers or contact content are emitted.
- No RLS, money, Stripe, payout, refund, or relationship mutation is included.
- The SMS profile bootstrap now canonicalizes any existing legacy alias before writing, preventing a current application writer from conflicting with the validated database constraint.

## Verification

The PR gate proves:

1. active plan SQL contains no mutating DDL or DML;
2. every automatic mapping requires relationship evidence;
3. rollback uses the protected backup spine;
4. the SMS writer emits canonical roles only;
5. the complete repository, security, migration/RLS, and production-build gates still pass.

Execution remains a later package with its own approval and exact evidence.
