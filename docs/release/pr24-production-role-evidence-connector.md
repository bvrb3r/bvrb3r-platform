# PR24 Production Role Evidence Connector

## Certified baseline

- Production source: `050fae1d76ddb470ec0735249c175a1dbd5df8be`
- Baseline package: PR23 production-certified
- Inventory date: 2026-07-28
- Data access: aggregate counts only
- Production role mutation: none

## Canonical boundary

PR24 connects deterministic, read-only production role evidence. It does not
normalize a profile, infer a relationship, delete an orphaned business row, or
change RLS authority.

PR25 remains the separate founder-approved account-role normalization package.
Its plan may change only `profiles.role` rows supported by explicit linkage
evidence, with a backup and rollback packet. PR24 cannot execute that plan.

## Production aggregate evidence

| Evidence | Count |
| --- | ---: |
| Profiles inspected | 27 |
| `client_user` | 20 |
| `barber_user` | 6 |
| `shop_owner_user` | 1 |
| Invalid or blank primary roles | 0 |
| Role-normalization candidates | 0 |
| Active invalid shop relationships | 0 |
| Client rows missing a profile link | 1 |
| Shop rows missing an owner-profile link | 1 |
| Barber linkage gaps | 0 |

The two missing-profile linkage rows remain explicit **Needs Review** evidence.
PR24 does not guess an identity or delete historical business data.

## Required implementation

1. Add a service-only SQL snapshot that returns counts and classifications,
   never profile identifiers or contact details.
2. Separate connector certification from role-truth posture: linkage gaps can
   remain Needs Review while the connector itself is proven complete and honest.
3. Keep normalization non-executable and report `mutationAttempted=false`.
4. Correct historical relationship classification to use the real
   `status`/`ended_at` schema instead of a nonexistent `is_active` field.
5. Bind release certification to the exact commit and Vercel deployment.
6. Prove the snapshot on isolated staging before production.
7. Apply only the forward connector/certificate migrations to production after
   exact-head CI and preview pass.
8. Issue the production certificate only after the exact merge deployment is
   Ready and smoke checks pass.

## Release invariants

- No `profiles.role` update is allowed.
- No customer name, email, phone, profile ID, or relationship terms appear in
  the snapshot or certificate.
- No guessed client, barber, shop, or owner linkage is created.
- Missing or stale evidence remains Needs Review.
- Invalid active account/relationship truth remains Failed.
- PR25 stays independently reviewable and rollback-safe.
