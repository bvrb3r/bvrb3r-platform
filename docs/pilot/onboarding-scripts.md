# Pilot Onboarding Scripts

Date: 2026-07-05

These scripts are for founder-authorized pilot sessions only.

V1 is not public launch ready; pilot execution is gated on RC evidence closure.

## Support And Notification Reality

Support intake reality:
- In-app support intake is functional.
- It creates a support thread, sends a support message, and records a platform event.
- Manual founder fallback is still required for pilot safety.

Notification consent reality:
- Notification preference toggles can be saved.
- Some notification categories are display-only or controlled elsewhere.
- SMS, email, and push delivery must not be promised from consent alone.

## Client Script

Actor: Founder or Architect observer

Use this language:

"You are using BVRB3R as a Client. Your account role is `client_user`. In this
pilot, we are checking whether you can understand the app, find the right path,
and report anything confusing. If support is needed, use the in-app support
path when available. If anything blocks booking, payment understanding, login,
messages, or safety, stop and tell the founder immediately."

Do not promise:

- public launch readiness
- live payment readiness
- SMS, email, or push delivery
- a completed booking unless the founder has authorized that exact pilot step

## Barber Script

Actor: Founder or Architect observer

Use this language:

"You are using BVRB3R as a Barber. Your account role is `barber_user`. In this
pilot, we are checking whether your profile, availability, schedule, messages,
and service-completion posture are understandable. Payout release and live money
movement are not part of this documentation PR."

Do not promise:

- payout release
- live checkout
- live notification delivery
- production readiness beyond the founder-approved pilot scope

## Shop Owner Script

Actor: Founder or Architect observer

Use this language:

"You are using BVRB3R as a Shop Owner. Your account role is `shop_owner_user`.
In this pilot, we are checking whether shop setup, services, schedule, team
visibility, settings, support, and evidence capture are understandable. If
anything looks wrong, unclear, or unsafe, we pause and capture evidence."

Do not promise:

- public launch readiness
- live payment readiness
- role or RLS repair
- external provider delivery

## Architect Observer Script

Actor: Architect

Use this language:

"Architect is observing the pilot. Architect does not mark anything Pass unless
evidence proves it. Missing evidence becomes Needs Evidence. Broken behavior
becomes a follow-up issue. Pilot execution remains gated by the PR #60 RC gap
closure list."

## Required Role Reminder

- Client = `client_user`
- Barber = `barber_user`
- Shop Owner = `shop_owner_user`
- Relationship types are not roles.
- Kiosk is not a role.
- Guest is a browse state.
