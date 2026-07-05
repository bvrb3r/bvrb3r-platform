# First Shop Setup Checklist

Date: 2026-07-05

This checklist prepares one controlled real-shop pilot. It documents actions;
it does not perform them.

V1 is not public launch ready; pilot execution is gated on RC evidence closure.

## Setup Sequence

| Order | Actor | Step | Evidence to capture | Status rule |
| --- | --- | --- | --- | --- |
| 1 | Founder | FOUNDER ACTION: choose the pilot shop and confirm owner contact | Written founder confirmation | Needs Evidence until captured |
| 2 | Founder | FOUNDER ACTION: create or verify the shop record through approved production tools | Screenshot or Architect packet | Needs Evidence until captured |
| 3 | Founder | FOUNDER ACTION: create or verify the `shop_owner_user` account | Screenshot or Architect packet | Needs Evidence until captured |
| 4 | Founder | FOUNDER ACTION: create or verify pilot `barber_user` accounts | Screenshot or Architect packet | Needs Evidence until captured |
| 5 | Founder | FOUNDER ACTION: create or verify any pilot `client_user` accounts | Screenshot or Architect packet | Needs Evidence until captured |
| 6 | Shop Owner | Review shop name, address, public posture, hours, and policies | Screenshot | Needs Evidence until captured |
| 7 | Shop Owner | Review services and pricing for pilot-only use | Screenshot | Needs Evidence until captured |
| 8 | Barber | Review barber profile, services, and availability | Screenshot | Needs Evidence until captured |
| 9 | Founder | FOUNDER ACTION: confirm Stripe TEST MODE ONLY posture for pilot test accounts | Dashboard screenshot with secrets hidden | Blocks pilot if absent |
| 10 | Founder | FOUNDER ACTION: verify live-mode Stripe configuration separately, read-only, without assuming readiness | Written founder confirmation | Needs Evidence |
| 11 | Architect | Confirm support path and manual fallback are available | Evidence packet | Needs Evidence |
| 12 | Architect | Confirm notification consent posture is described accurately | Evidence packet | Needs Evidence |
| 13 | Founder | FOUNDER ACTION: approve kiosk posture for the pilot device or park kiosk for the session | Written founder confirmation | Needs Evidence |
| 14 | Founder | FOUNDER ACTION: name evidence destination for screenshots, exports, and notes | Written founder confirmation | Needs Evidence |
| 15 | Founder | FOUNDER ACTION: authorize or reject the pilot session | Written founder confirmation | Required before execution |

## Payment Posture

- Live-mode Stripe configuration is external founder-verified evidence, never assumed.
- Pilot test accounts must follow the test account protocol.
- Pilot setup must not create real payment methods through this PR.
- Pilot setup must not trigger checkout, refund, payout, ledger, or routing mutation from this PR.

## Support Posture

- In-app support intake exists and routes support messages plus platform events.
- Manual founder phone/text or in-person escalation remains required during pilot.
- Support escalation is defined in `docs/pilot/support-escalation.md`.

## Evidence Capture Setup

Before pilot execution, Founder selects the evidence destination for:

- session screenshots
- dashboard exports
- Architect packets
- written founder confirmations
- issue notes
- pause/resume decisions
