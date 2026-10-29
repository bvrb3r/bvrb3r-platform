# Square booking entry — release status

Prepared 2026-10-28. Target: `https://bvrb3r.app/kiosk`.

This change adds a branded welcome page and same-tab navigation to Square's
existing booking application. It is a booking entry, not a certified unattended
kiosk. Do not mount an unattended customer iPad until the device gates below pass.
Existing `/kiosk/shop/*`, `/kiosk/barber/*` and platform payment routes are unchanged.

## Observed Square configuration

Owner-provided link: `https://squareup.com/appointments/book/LQQVQXJC0BSHF`.
It redirected to `https://bvrb3r.square.site/`. The Book control opened the
Square booking application. The welcome button uses the observed direct menu:
`https://book.squareup.com/appointments/kb47sx4fuevpak/location/LQQVQXJC0BSHF/services`.

| Item | Evidence / status |
| --- | --- |
| Live menu | Pass: Men's Hair Cut $30 / 20 min; Men’s Haircut and beard $35 / 30 min; Kids Haircut $30 / 15 min. These are observations, not copied into the application. |
| Availability | Pass for public display only: haircut times shown for Oct 29, 2026 in EDT. Calendar conflict enforcement remains unverified. |
| Customer details | Pass for form presence: first name, last name, email, phone. |
| Full prepayment | Pass for displayed configuration: checkout states full prepayment required; sample haircut shows $30 due today. No transaction was submitted. |
| Card-on-file consent | Present: separate authorization to save the card for future purchases. No consent was accepted. |
| Marketing consent | Optional unchecked checkbox present. Never preselect this in a custom flow. |
| Barber choice | Unverified: no staff selector appeared in the sampled haircut flow. Check Square online staff visibility and assignments. |
| Booking acceptance | Unverified: inspect whether requests auto-confirm. |
| Successful charge, calendar entry, confirmation, refund | Unverified: no customer information entered, booking submitted, or payment made. Selecting a time opened Square's temporary 10-minute hold. |
| BVRB3R profile | Not created. Square's checkout describes creating a Square Appointments account. |

## Implementation boundary

- The page contains no customer forms, payment SDK, booking API mutation or copied availability.
- Square handles customer data, payment, confirmation and its own policies.
- The exact `/kiosk` route omits platform account recovery, device sync, PWA install prompts and push prompts. Other routes retain their providers.
- An offline browser cannot use the booking link until its connection returns.
- Same-tab navigation avoids accumulating customer tabs. It does NOT clear Square data or make the device safe for the next customer.
- There is no pretend success screen, reset timer, or cross-origin completion listener. Once the browser leaves BVRB3R, this page cannot monitor Square interaction or clear Square cookies, storage, autofill or history.

## Required iPad release gates

1. Record iPad model, iPadOS version, browser/kiosk software version and portrait/landscape setup.
2. Use a dedicated customer device without staff Square or BVRB3R sessions. Disable password/card autofill and browser sync through device settings.
3. Verify a supported kiosk browser or managed app can return to `/kiosk` after completion AND inactivity, clear Square website data and history, prevent back navigation to the previous customer, and recover after restart. Guided Access alone is not proof of data clearing. Do not configure a blind wall-clock timeout that can interrupt an active payment.
4. Confirm full prepayment, correct online staff visibility, service assignments, auto-accept behavior, business time zone, cancellation policy and receipts in Square.
5. On the actual iPad, complete an owner-approved test appointment/payment. Confirm the correct barber, service, date, time, amount, Square payment record, calendar entry and customer confirmation.
6. Test abandonment after entering details, successful checkout, Back/Forward, refresh, repeat taps, decline, Wi-Fi loss during payment, reconnect and device restart. Never retry an uncertain payment automatically; reconcile Square first.
7. For two consecutive test customers, prove no previous identity, phone, email, card fragment, login, receipt or appointment is accessible. Record evidence without exposing customer data.
8. Test cancellation/refund in Square and confirm only the intended appointment/payment is affected.

Pass requires every applicable gate with evidence. No payment reader integration
is implemented here; online card entry does not enable physical card tapping on a
Square Stand.

## Official references

Kiosk Pro Basic or higher is a candidate for device testing: its official docs
describe touch-based idle reset, cookie/session clearing and local-storage
clearing. This is not a verified Square compatibility claim. Enable the relevant
privacy settings explicitly (cookie clearing defaults off). A normal web link
back to the homepage does not trigger its cookie clearing. The completion-page
reset still needs to be configured and proved on the actual device.

- Square online booking: https://squareup.com/help/us/en/article/5355-set-up-online-booking-with-square-appointments
- Square prepayment configuration: https://squareup.com/help/us/en/article/5493-set-a-custom-cancellation-policy-with-square-appointments
- Kiosk Pro idle reset: https://support.kioskgroup.com/article/991-idle-time-limit
- Kiosk Pro cookie/session clearing: https://support.kioskgroup.com/article/997-clear-cookies-session-storage-on-content-refresh
- Kiosk Pro local-storage clearing: https://support.kioskgroup.com/article/996-clear-local-storage-on-content-refresh
