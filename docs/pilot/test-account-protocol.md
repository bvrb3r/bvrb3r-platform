# Pilot Test Account Protocol

Date: 2026-07-05

This protocol prevents pilot test accounts from moving real money.

V1 is not public launch ready; pilot execution is gated on RC evidence closure.

## Required Money Guardrail

Stripe TEST MODE ONLY is required for all pilot test accounts.

Pilot test accounts must never be connected to live Stripe payment movement.

Live-mode Stripe configuration is external founder-verified evidence, not
assumed by this PR.

## Naming Convention

All pilot test accounts and labels must start with:

`TEST-PILOT-`

Examples:

- `TEST-PILOT-CLIENT-01`
- `TEST-PILOT-BARBER-01`
- `TEST-PILOT-OWNER-01`
- `TEST-PILOT-SHOP-01`

## Founder Action Only

Only the Founder creates pilot accounts, shop records, or provider-side test
objects. Codex does not create them in this PR.

Required account roles:

- `client_user`
- `barber_user`
- `shop_owner_user`

Do not create new public roles for the pilot.

## Payment Method Rules

- Do not use real personal cards for pilot test accounts.
- Do not create live payment methods for pilot test accounts.
- Do not use production live-mode payment movement for test accounts.
- Do not run refunds, payouts, ledger changes, or payment routing changes from this PR.
- Any provider dashboard check must be read-only unless the founder separately authorizes a real pilot payment outside this PR.

## Cleanup / Teardown

Founder records:

- account names
- shop label
- barber labels
- client labels
- test provider objects, if any
- evidence destination
- cleanup owner
- cleanup date

Cleanup must remove or archive only pilot test artifacts through approved app or
provider tools. No destructive SQL is authorized by this protocol.

## Evidence Required

- Screenshot or export showing TEST MODE ONLY posture.
- Written founder confirmation that no live payment method was attached to any test account.
- Written founder confirmation that no real money was moved by test accounts.
