# PR 18 — Barber/Owner kiosk parity: evidence

Branch `build/target-outcome-v22`. Scope: bring `/kiosk/shop/[shopId]` and
`/kiosk/barber/[barberId]` to the approved BVRB3R kiosk prototypes, close the
accessibility and privacy gates, and make the whole mission runnable locally
without Supabase.

Approved reference package used for comparison (supplied as
`design/pr18-approved-reference.zip`, extracted to a scratch directory for
review and **not** committed):

- `final-handoff/github-pr/pr18-kiosk-parity/PR18.md`
- `final-handoff/github-pr/pr18-kiosk-parity/GITHUB-PR-DESCRIPTION.md`
- `final-handoff/github-pr/pr18-kiosk-parity/reference/BVRB3R Shop Kiosk.dc.html`
- `final-handoff/github-pr/pr18-kiosk-parity/reference/BVRB3R Barber Kiosk.dc.html`
- `final-handoff/github-pr/pr18-kiosk-parity/reference/support.js`
- `final-handoff/screenshots/kiosk/01 Barber Kiosk.jpg`
- `final-handoff/screenshots/kiosk/02 Shop Kiosk.jpg`

---

## 1. Acceptance checklist

| PR18.md item | State |
| --- | --- |
| Both routes match the reference prototypes state-for-state | Met, with the deliberate differences in §4. Visually certified at the desktop/kiosk viewport only — see §7 |
| Real name appears ONLY on the celebration reveal card | Met and regression-tested, including the no-handle case |
| Each barber's own prices everywhere, shop kiosk included | Met — prices plumbed from `services.price` |
| Decline never books; retry and cash paths both work | Met — failure never advances to the celebration |
| Idle wipe: no client data after reset; never fires mid-charge | Met and regression-tested |
| EN/ES/KRE render on every step; Aa scales; chime/buzz fire | Met |
| QR scans to `/r/{confirmationCode}` | Met — real encoder, structurally verified |
| `lint && typecheck && test` green | Met — see §5 |

## 2. What shipped

**Copy and language.** `lib/kiosk/locale.ts` carries the full EN/ES/HT
dictionary transcribed from both prototypes, plus composed-sentence helpers
(queue chips, tip tiles, SMS body, attract decks, "From $X") so no caller
concatenates translated fragments. `?lang=` resolves server-side, survives the
between-client wipe, and sets `lang` on the kiosk root so a screen reader
switches voice with the copy.

**Front door.** Shop scope renders the fastest-chair fast lane plus one card per
barber with a wait chip and a "From $X" chip priced from that barber's own
cheapest service. Barber scope renders the two path cards directly. Handles
only — never a real name.

**Details.** Name / phone / email / optional username with returning-client
recognition, a full-row consent target, and a scrollable per-barber priced
service rail with the live when-card.

**Payment.** Card/cash choice, four tip tiles with cent-exact math
(`lib/kiosk/tip.ts`), an in-flight reserving state, and a decline/failure banner
that recovers to retry or cash. See §4 for the card-processing boundary.

**Celebration.** Confetti, pop-in check, receipt chips, the barber reveal card
(the only real-name surface), an SMS preview composed in the client's language,
and a scannable QR of the real `confirmationCode`.

**Attract loop.** Four rotating slides per scope and language, entered only
after a full privacy wipe, and hard-guarded against firing mid-booking.

**Local fixture.** `KIOSK_LOCAL_FIXTURE=true` seeds three barbers with distinct
priced menus, two searchable returning clients, and a published PIN. Nothing in
that path touches Supabase or Stripe, and it is inert when `NODE_ENV=production`.

## 3. Privacy and payment safety

**Public identity.** `lib/kiosk/identity.ts` resolves a handle or `null` and
never falls back to a name — deliberately unlike the app-wide
`getClientFacingBarberName`, which does. A barber with no handle is labelled
"Chair N" (localized: Silla / Chèz); the barber front door shows "This chair".
`profiles.public_username` now travels through the queue payload so a real
handle is used when one exists.

**Optional username.** A walk-in books as a guest with name, phone and email.
The legacy `publicUsername`-required rule was removed from both booking schemas;
name, phone, email and service validation are unchanged. Guest-to-account
conversion remains PR 23's scope.

**Card processing.** BVRB3R has no Stripe Terminal plumbing — PR 22 owns it.
Selecting Card in production therefore shows an honest localized "Card isn't set
up at this kiosk yet / Nothing was charged and nothing is booked yet" state and
offers the cash path. It never calls the booking action. The reader and tip
states exist only behind `cardSimulationEnabled`, which the **server** sets from
`isKioskFixtureTarget` — the client cannot switch it on, and the fixture is
hard-false under `NODE_ENV=production`.

**Privacy reset.** One `wipe()` covers completion, inactivity timeout, "Cancel &
reset", "Done — next client", and the staff PIN exit. It clears identity,
appointment, payment method, tip, booking result and the accessibility
preferences the last client set. It retains the owner's configuration: the
device's shop/scope binding and the launch language.

## 4. Deliberate differences from the approved prototypes

Each is a conscious decision, not an omission.

1. **Card processing is honestly unavailable until PR 22.** The prototype charges
   a card and prints "Paid $48 · inc. $8 tip ✓". No terminal plumbing exists, so
   claiming a completed charge would be a fabricated payment confirmation on a
   public screen. The celebration states the plan truthfully — "Card after the
   service · $54 · inc. $9 tip" — and only the server-locked local fixture
   simulates the reader and tip states for visual QA.
2. **Muted text raised to ≥0.55 alpha.** The prototypes use values down to 0.30
   (and 0.32 for placeholders), which fall under 4.5:1 on the `#060708` canvas.
   0.55/0.60 are values the prototypes themselves use most, so this moves toward
   the reference palette rather than away from it.
3. **A visible focus ring was added**, scoped to `[data-kiosk-surface]`. The
   prototypes have none; an unattended public terminal needs one.
4. **Schedule-ahead uses a datetime field, not the prototype's day-chip + slot
   grid.** The kiosk payload carries no availability slot list, so a slot grid
   would have to be invented. Wiring real slots is follow-up work.
5. **Gift-cut offer, loyalty card and gift-cards lock card are not shipped.**
   These prototype states have no backing API and would be fake money UI. They
   are not in the PR18.md acceptance checklist. Flagged for a product decision.
6. **Confetti geometry is derived from the piece index, not `Math.random()`,** so
   a confirmation screen renders identically on every device and in every test.

## 5. Verification

Run locally on `build/target-outcome-v22`.

| Gate | Result |
| --- | --- |
| Focused PR 18 suites (14 files) | 192 passed |
| Full suite | **2,381 passed / 2,381** (321 files) — was 2,214 |
| `npm run lint` | pass (`--max-warnings=0`) |
| `npm run typecheck` | pass |
| `node scripts/verify-financial-doctrine.mjs` | PASS |
| `npm run build` | pass (includes `verify:doctrine` + `verify:deployment`) |

New test files: `kiosk-qr.spec.ts`, `kiosk-tip.spec.ts`, `kiosk-sound.spec.ts`,
`kiosk-accessibility.spec.tsx`, `kiosk-production-safety.spec.tsx`.

**QR correctness** is proved structurally, since no scanner exists in CI: the
Reed–Solomon block has zero syndromes, the symbol is read back off the grid and
compared byte-for-byte against the encoder's own codeword stream, the fixed
patterns land where the spec requires, and the data path visits every module
exactly once.

**Contrast** is computed with a WCAG 2.1 relative-luminance implementation in
the test, which derives the 0.55 alpha floor rather than hard-coding it, then
scans the rendered tree for any muted class below it.

## 6. Live server checks (this session)

`KIOSK_LOCAL_FIXTURE=true` dev server on port 3000. Note: `npm run dev` fails on
Linux because `scripts/dev-clean-port.mjs` hard-codes Windows paths
(`C:\Windows\System32\netstat.exe`) with no platform guard — a pre-existing bug
outside PR 18's scope. Started via `next dev -p 3000` directly.

- `/kiosk/shop/kiosk-local-fixture-shop` → 200
- `/kiosk/barber/kiosk-local-fixture-barber` → 200
- `?lang=es` → `<main lang="es">`, "Kiosko de la barbería"
- `?lang=ht` → `<main lang="ht">`, "Kyòs boutik la"
- Shop payload: three barbers with distinct handles, waits (10 / 0 / 45 min) and
  cheapest prices ($20 / $15 / $18)
- Guest booking, no username → 201 `LOCAL001`, `clientPublicUsername: null`
- Schedule-ahead with username → 201 `LOCAL002`, requested time honoured
- Barber-kiosk guest booking → 201
- Guest missing email → 400
- Staff PIN `2468` → 200; wrong PIN → 401
- Barber front door SSR contains no real name

## 7. Visual comparison (supervising session)

Performed by the supervising session against the approved v22 references and
reported here; not run in this session.

**Scope and limitation.** The live visual comparison covered the available
**desktop/kiosk viewport** against the approved shop and barber screenshots.
**Phone and tablet were not visually certified.** Their responsive behaviour is
supported by the fluid CSS (`clamp()` display type, breakpoint-gated grids,
`overflow-x-hidden`, `min-h-[100svh]`) and by the automated coverage in
`kiosk-accessibility.spec.tsx`, but no phone or tablet rendering was inspected.
Treat phone/tablet parity as untested, not as passed.

- **PASS** (desktop/kiosk viewport) — shop and barber front doors against the
  approved screenshots:
  Archivo / Instrument Serif / Space Mono treatment, signal green, glass/dark
  surfaces, control styling, shop cards, two-panel barber layout.
- **PASS** — EN/ES/KRE switching, Aa pressed state, exit dialog focus landing,
  Escape close and focus restore to the exact trigger.
- **PASS** — handle-only pre-booking privacy; optional-username guest booking.
- **PASS** — fixture-only card mission with 20% tip → `LOCAL001`; cash mission →
  `LOCAL002`.
- **PASS** — real name revealed only on confirmation; QR and SMS content correct.
- **PASS** — "Done — next client" removes name, phone and reference code from
  the DOM.
- **Deliberate difference confirmed** — real production card processing remains
  honestly unavailable until PR 22; only the server-locked local fixture
  simulates the reader and tip states.
