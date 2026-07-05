# Pilot Support Escalation

Date: 2026-07-05

This escalation plan is based on the actual PR #56 support intake reality.

V1 is not public launch ready; pilot execution is gated on RC evidence closure.

## Support Reality

In-app support is functional:

- `lib/support/issue-intake.ts` validates role-safe support categories.
- `app/api/support/issue-intake/route.ts` accepts authenticated support issue submissions.
- Support intake creates a support thread and support message.
- Support intake records a platform event.

Manual fallback is still required during pilot:

- Founder phone/text placeholder: `[FOUNDER CONTACT CHANNEL]`
- In-person shop escalation: Founder or named shop lead
- Architect review notes: captured in the pilot evidence destination

## Escalation Ladder

| Level | Use when | Actor | Expected response | Evidence |
| --- | --- | --- | --- | --- |
| Level 1: In-app support | Non-blocking product feedback or minor confusion | Client, Barber, Shop Owner | Same pilot session if possible | Support thread id, screenshot |
| Level 2: Founder manual channel | Booking, account, payment understanding, kiosk, or role access is blocked | Founder | Immediate pilot decision | Text/call note, screenshot |
| Level 3: Architect evidence packet | Issue needs engineering triage | Architect | Follow-up packet after evidence capture | Route, role, expected/actual, logs if available |
| Level 4: Pilot pause | Money, safety, role leakage, or repeated failure appears | Founder | Pause until reviewed | Written pause decision |

## What Gets Logged

- actor role
- screen or route
- support category
- severity
- description
- screenshot or photo
- support thread id if in-app support succeeded
- manual fallback note if used
- founder decision

## When The Pilot Pauses

Pause immediately for:

- unclear payment or receipt state
- any possible live-money confusion
- role/access boundary confusion
- support unavailable through both in-app and manual fallback
- safety or trust concern
- repeated booking or kiosk failure

## Support Copy For Pilot Team

"Use in-app support when it is available. If the issue blocks a booking, money
understanding, account access, role access, safety, or the pilot schedule, stop
and contact the founder immediately."
