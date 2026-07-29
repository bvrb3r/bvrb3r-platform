# BVRB3R — Privacy Policy (DRAFT)
**Status: DRAFT — requires attorney review before publication.** Plain-language voice per `COPY-DECK.md`. Not legal advice; nothing binds until counsel approves a dated version.

**Version:** Draft 1 · Jul 26, 2026 · **Effective:** _pending_
**Controller:** BVRB3R, [entity], [state] — *counsel to confirm*
**Contact:** privacy@bvrb3r.app

---

## 1. The short version
We collect what the app needs to book a cut, move money safely, and keep the floor honest. Not more.

Five promises, stated here so you don't have to hunt for them:

1. **We never sell your personal information.** Not to advertisers, not to data brokers.
2. **Your location is never shown publicly.** We use it to find chairs near you and then we're done with it.
3. **We never expose a barber's home address** just because a coordinate exists in our database.
4. **One barber never sees another barber's earnings.** A shop owner never sees a barber's external-platform money.
5. **We don't read your messages to mine them.** We store them so your conversation works, and we look only when safety, a dispute, or the law requires it.

## 2. What we collect

### From clients
| Data | Why |
|---|---|
| Name, phone, email | Identify you, confirm bookings, send reminders |
| Photo, username, bio | Your public profile and Culture posts |
| Payment method (via Stripe) | Pay your barber. **We never see or store your full card number** |
| Booking, visit, and receipt history | Your appointments, rebooking, disputes |
| Approximate location, only when you allow it | Find chairs near you |
| Messages with barbers and shops | Your conversations |
| Reviews and Culture activity | Public by design |
| Device, app version, crash logs | Fix what breaks |

### From barbers and shop owners
Everything above, plus: license and verification documents · Stripe Connect identity data (held by Stripe) · service menu, hours, availability · earnings and booth-rent records · connected-calendar appointment times · kiosk device pairing · team relationships and agreements.

### From walk-ins and guests
Name, phone or email, and the service booked. That's the minimum to protect a booking and a receipt. If you later claim an account, that history carries over.

### From kiosks
A kiosk collects only what a booking needs, then **wipes the screen between clients**. Kiosk device location is visible to the shop owner and BVRB3R operations, never to the public.

## 3. Where it comes from
From you · from your barber or shop when they add you to their book · from Stripe (payment status, never full card data) · from a calendar provider you connect (times, not money) · automatically from your device.

## 4. How we use it
Run bookings, walk-ins, and the queue · move payments through Stripe · calculate and record booth rent · show public profiles, reviews, and Culture · send the messages you asked for · verify licenses and shops · detect fraud and abuse · answer support and disputes · measure what's broken and improve it · meet legal and tax obligations.

**We do not** sell your data, use your private messages for advertising, or let a map or ads provider decide which barber you see. Ranking comes from our own records — verification, availability, distance, service match, ratings, history.

## 5. Who can see what
This is the part most policies leave vague. Ours is a table.

| Data | Client sees | Barber sees | Shop owner sees | Public sees |
|---|---|---|---|---|
| Your name and photo | own | their clients | shop's clients | if you post |
| Your phone/email | own | their clients | walk-ins at their shop | never |
| Your exact location | own | never | never | never |
| Your card number | never (Stripe holds it) | never | never | never |
| Your receipts | own | their transactions | rent contributions only | never |
| Barber's earnings | never | **own only** | never | never |
| Barber's external-platform money | never | own only | **never** | never |
| Barber's private notes on a client | never | own only | never | never |
| Booth rent records | never | own agreement | own shop | never |
| Culture posts | yes | yes | yes | yes |
| Reviews | yes | yes | yes | yes |
| Verified shop address | yes | yes | yes | yes |
| Barber's home address | never | own only | never | **never** |
| Kiosk device location | never | own chair | own shop | never |

**Location tiers.** Verified shops show an exact pin. A barber inside a shop shows the shop's address. A mobile barber shows an approximate service area. A home-based barber shows a city, neighborhood, or radius only — never a street address.

## 6. Who we share with
**Processors who work for us, under contract:** Stripe (payments and payout identity) · Supabase (database and auth) · Vercel (hosting) · Mapbox (map rendering and address lookup) · Twilio (SMS) · [email provider] · Apple/Google (push). Each gets only what its job needs.

**Calendar providers you connect** — we exchange scheduling data, never payments.

**Legal and safety** — when law requires it, or to protect someone from harm. Where we're allowed to tell you, we will.

**A business transfer** — if BVRB3R is acquired, your data may transfer with it under this policy until a new one is published with notice.

Never: advertisers, data brokers, or anyone buying a list.

## 7. Messages, notifications, and consent
Booking confirmations, reminders, "you're up," and receipts are **transactional** — you can't opt out of the appointment you booked.

Everything else is **outreach** and needs your yes: rebook nudges, open-chair offers, promos, birthday messages. You control each channel and can opt out at any time from Notification Preferences. A barber cannot switch your opt-out back on. Quiet hours (9 PM–9 AM local) are respected on outbound messaging.

## 8. Your choices and rights
- **See your data** — Account → Data & Deletion → Export my data
- **Correct it** — edit your profile, or ask us
- **Delete your account** — Account → Data & Deletion. We honor it on our published schedule
- **Withdraw location permission** — from your device; the app still works, with fewer nearby results
- **Opt out of outreach** — Notification Preferences
- **Disconnect a calendar** — sync stops going forward

Residents of California, Colorado, Connecticut, Virginia, and other states with privacy statutes, and users in the EU/UK, may have additional rights including access, portability, correction, deletion, and appeal. *Counsel to add the required state-specific and GDPR/UK-GDPR disclosures, legal bases, DPO/representative details, and appeal mechanism.*

## 9. What we keep after you leave
Deleting your account removes your profile, posts, messages, and private notes. We keep what we're legally required to keep: completed transaction records, tax records, dispute and chargeback history, and booth-rent ledgers, because they are someone else's financial record too. Retention periods: *counsel to set*.

## 10. Security
Encryption in transit and at rest · row-level security so a query can't reach data outside your role · least-privilege access with audit logs · card data held by Stripe, never on our servers · kiosk screens wiped between clients · session expiry and device revocation.

No system is perfect. If a breach affects you, we notify you and the required authorities within the legally mandated window. *Counsel to confirm timelines per jurisdiction.*

## 11. Children
BVRB3R is not for anyone under 18. A parent may book for their child from their own account. We don't knowingly collect data from children; if we learn we have, we delete it.

## 12. International transfers — *counsel to draft*
[Transfer mechanism, SCCs, and adequacy language if BVRB3R serves users outside the US.]

## 13. Changes
We'll post material changes in the app before they take effect, with the date. Prior versions stay available.

## 14. Contact
privacy@bvrb3r.app · support@bvrb3r.app · [mailing address] · [DPO / EU representative if applicable]

---

## Notes for counsel
1. **Section 5's visibility table is a product guarantee**, enforced in code by row-level security. If a clause elsewhere would let a shop owner see barber earnings or external money, that clause contradicts the app and is wrong.
2. **Location tiers (§5)** — confirm the home-based-barber protection is sufficient, and that showing an approximate service area for mobile barbers is adequately disclosed.
3. **Guest and walk-in collection (§2)** — data captured before an account exists. Confirm notice-at-collection is adequate, especially for CCPA/CPRA.
4. **Kiosk (§2)** — a shared device in a public place collecting name, phone, and email. Confirm the between-client wipe and on-screen notice meet requirements.
5. **Transactional vs. outreach split (§7)** — confirm this satisfies TCPA for SMS and CAN-SPAM for email, and that our consent records are adequate.
6. **Retention (§9)** — set actual periods. Note the tension: a barber's rent ledger is also the shop's financial record, so a client-side deletion cannot erase it.
7. **Processor list (§6)** — confirm DPAs exist with each, and that Mapbox usage complies with its terms (we only persist geocodes marked permanent).
8. **State-law and GDPR disclosures (§8, §12)** — to be drafted; the draft deliberately leaves these to counsel rather than guessing.
9. Companion drafts still needed: **Refund Policy**, **Booth Rent Agreement template**, **Messaging Consent**, **Acceptable Use**.
