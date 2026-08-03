# Mission 7 — Final V1 production certification

## Stage order

1. Deploy the signature-verified, metadata-only Stripe webhook probe and the database identity/security closeout.
2. Generate one exact live `customer.updated` probe carrying:
   - `bvrb3r_certification_probe=v1-live-webhook`
   - `bvrb3r_certification_scope=processor-verification-only`
3. Require the production money snapshot to report `pass` with zero review findings.
4. Enable the final zero-review V1 gate, deploy the exact commit, run the controlled operating cycle, and write the commit-bound Architect certification record.

## No-money boundary

The live probe must not create or change a PaymentIntent amount, charge, refund, transfer, payout, invoice amount, subscription amount, or connected-account balance. It records only idempotent webhook audit evidence after Stripe signature verification.

## Exit matrix

`V1 READY — 100%` requires zero critical blockers, failed gates, needs-review gates, noncanonical public roles, critical security/RLS findings, core-route 5xx responses, dead core-flow links, money anomalies, refunded payout-ready routes, unresolved payout failures, sensitive logging findings, missing legal documents, mandatory regression failures, deployment/commit mismatches, authenticated role-loop failures, and kiosk certification failures.

The final `v1_architect_certification_records` entry stores the production commit, deployment ID, evidence, gate counts, signing profile, timestamp, and SHA-256 integrity digest. The digest is an evidence-integrity signature, not an external certificate-authority signature.
