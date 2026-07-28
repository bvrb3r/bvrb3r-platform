# PR23 Retired Financial-Model Removal Inventory

## Certified baseline

- Production source: `435943753d7f87f65f1b76e2119cbbb2f041be57`
- Baseline package: PR22 production-certified
- Inventory date: 2026-07-28
- Data access: aggregate counts only; no private content or financial fixture rows were read or created

## Doctrine boundary

Full Booth Rent and AutoBooth Rent are the only supported shop-barber financial models. A freelance barber has no shop rent relationship. Historical records must never be promoted into a rent agreement because that would invent debt without dual acceptance.

PR23 removes active dependence on the retired pre-doctrine financial model and blocks new writes of its legacy rate metadata.

PR25 remains the separate account-role normalization package. PR23 must not change profile roles, infer shop relationships, or consume PR25's explicitly reviewed migration plan.

## Production inventory

| Surface | Current rows | Retired active values | Residual legacy metadata |
| --- | ---: | ---: | ---: |
| Barber operating records | 6 | 0 | 3 freelance rows have a non-zero historical rate |
| Legacy financial ledger | 0 | 0 | 0 |
| Legacy financial rules | 0 | 0 | 0 |
| Compensation rules | 0 | 0 | 0 |
| Compensation snapshots | 0 | 0 | 0 |
| Payment routing | 24 | 0 | 0 |
| Shop-barber relationships | 0 | 0 | 0 |
| Team invitations | 1 | 0 | 0 |
| Staff locations | 2 | 0 | 0 |

## Required implementation

1. Identify every active application writer that can populate the historical rate fields or legacy ledger/rules surfaces.
2. Remove those writers or make them fail closed under the locked doctrine.
3. Add a forward-only migration that clears only stale historical rate metadata where the canonical model is freelance and no agreed rent exists.
4. Add database constraints or guarded write functions that prevent the retired model and its rate metadata from reappearing.
5. Preserve immutable historical migrations and audit evidence.
6. Keep account-role normalization, unsupported role review, and relationship inference outside PR23.
7. Add focused application, migration, RLS, idempotency, and doctrine regression tests.
8. Require isolated staging replay and aggregate before/after evidence before production cutover.

## Release invariants

- No rent agreement is created by migration.
- No money is transferred, refunded, paid out, or reclassified.
- Tips and barber service earnings remain private to the barber.
- Production reconciliation remains exactly $0.00.
- Every change is forward-only, auditable, and reversible through an explicit backup record or deterministic rollback.
