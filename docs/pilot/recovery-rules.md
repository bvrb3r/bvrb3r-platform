# Pilot Recovery Rules

Date: 2026-07-05

These rules tell the pilot team when to continue, pause, or stop.

V1 is not public launch ready; pilot execution is gated on RC evidence closure.

## Recovery Matrix

| Symptom | Immediate action | Who decides | Pause trigger | Evidence to capture |
| --- | --- | --- | --- | --- |
| Booking fails mid-pilot | Stop the booking attempt and capture screen, route, user role, and time | Founder | Any repeated booking failure or unclear money state | Screenshot, browser console if available, support issue, Architect note |
| Payment confusion | Do not retry payment. Confirm whether the account is test-only | Founder | Any live payment uncertainty | Screenshot, provider mode evidence, user account label, written note |
| Role or access confusion | Stop the session and confirm role: `client_user`, `barber_user`, or `shop_owner_user` | Founder + Architect | User sees another role's tools | Screenshot, account email/label, route, expected role |
| Device or kiosk failure | Move to manual check-in or pause kiosk portion | Founder | Device cannot load, install, scan, or submit | Device model, route, screenshot/photo, network state |
| Support escalation needed | Use in-app support if available, then manual founder channel | Founder | Safety, payment, account access, or blocked booking issue | Support thread id if created, message screenshot, manual note |
| Real user confusion | Stop the task and ask the user to explain what they expected | Founder | User cannot identify what to do next | Quote, screen, role, next-action confusion |
| Failed confirmation or receipt posture | Stop and capture the exact confirmation state | Founder + Architect | Appointment/payment state cannot be explained safely | Screenshot, confirmation code if visible, route, support issue |

## Pilot Pause Rules

Pause the pilot immediately if:

- live money movement is unclear
- a test account is not clearly marked `TEST-PILOT-`
- a user sees unauthorized role tools
- support cannot be reached through in-app or manual fallback
- a booking or confirmation state cannot be explained
- a safety or trust concern appears

## Resume Rules

Resume only when:

- Founder records the decision to resume.
- Evidence is captured.
- A safe next step is named.
- The affected actor understands the next action.

## Architect Follow-Up

Architect converts every unresolved issue into a follow-up evidence packet with:

- symptom
- actor role
- route or screen
- expected behavior
- actual behavior
- captured evidence
- owner lane
- recommended next repair path
