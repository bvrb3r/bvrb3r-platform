# Mission 7 live webhook certification

The V1 processor proof uses a dedicated live-mode `customer.updated` event with two exact metadata markers:

- `bvrb3r_certification_probe=v1-live-webhook`
- `bvrb3r_certification_scope=processor-verification-only`

The production endpoint still verifies the Stripe signature. The certification handler writes only an idempotent aggregate audit row in `stripe_webhook_events`; it does not create or modify a charge, PaymentIntent, refund, transfer, payout, invoice amount, or subscription amount.

All events without both exact markers continue through the existing Stripe billing and money-movement processor.
