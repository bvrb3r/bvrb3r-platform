# BVRB3R Public-Site Parity Override

**Authority date:** August 3, 2026

**Scope:** `/`, `/app`, `/culture`, `/for-barbers`, `/for-shops`, and logged-out `/discover`

**Status:** Required visual and doctrine override for the PR21 frozen references

The PR21 HTML references remain the layout and typography baseline except where this file explicitly overrides them. When a screenshot, archived HTML reference, earlier prompt, or marketing draft conflicts with this file, this file wins.

## 1. Public background

- Public routes use a solid cinematic base of `#060708` with, at most, the restrained neutral top radial already approved for the public shell.
- The authenticated-app 72px grid, diagonal gold hatch, bottom-right gold orb, and broad decorative green haze must not render on public routes.
- Signal Green may appear in deliberate actions, selected/ready states, the comet, and the green period in approved headlines. It must not wash across the page as ambient decoration.
- Gold or muted cream is the public editorial/kicker color. Red is reserved for real errors, destructive states, or the red pole light.
- Public stars must use deterministic, organic placement. Repeated rows, columns, or diagonal coordinate patterns fail parity.

## 2. Culture and guest discovery are different doors

- `Culture` always opens `/culture`: the guest-visible social feed where each eligible post can lead to a booking.
- `Enter as guest` always opens `/discover?entry=guest`: barber/shop/service discovery and search.
- `/discover?entry=guest` is titled **Guest Discovery**, never **Guest Culture Feed**.
- On `/culture`, **Book this look** enters the real booking/discovery path. Like, comment, follow, and create-post actions require a Client account and route to `/signup?lane=client` while public signup is available; owner-review mode may safely route that signup door to the existing closed-signup/login behavior.
- Desktop navigation, mobile navigation, footer navigation, active-tab typing, canonical metadata, and regression tests must preserve this separation.

## 3. Barber-pole construction and composition

- The pole is the dominant cinematic object, not a small icon.
- At `1920×1080`, its physical visible object should be approximately `200–240px` wide and `650–730px` tall, occupying about 60–70% of the hero height. Its center should sit around 66–67% across the viewport.
- At `1440×1024`, preserve the same visual authority without colliding with the hero copy or pinned navigation.
- At `390×844`, use one responsive version of the same pole implementation. Scale and reposition it; do not switch to a competing public-site design.
- The construction must include a convincing dome/top cap, double collars, contained glass tube, curved or cylindrical stripe treatment, rails/body structure, and bottom bowl/cap.
- The visible stripe/light cores are exactly:
  - Cream: `#FFF6E6`
  - Red: `#FF4D4D`
  - Blue: `#4D7DFF`
- Cream, red, and blue each need an independent crisp core and a restrained bloom in the same hue. A dominant white bloom or muddy gray/purple combined halo fails.
- Green never belongs in the pole glow.
- `EST. SPINNING SINCE 1651` is positioned independently `16–18px` below the physical bottom cap. Empty SVG/container space must not push it farther away.

## 4. One public implementation

- One public-site component and token system must serve all supported viewports.
- No alternate desktop/mobile generation, duplicated background system, or viewport-only legacy shell is allowed.
- Page copy, CTA hierarchy, color meaning, navigation semantics, footer, and component styling remain consistent across desktop and mobile.
- The large outlined editorial numeral may remain on role-marketing pages. It is not the prohibited grid.
- Public scrollbars should be thin and low contrast with a transparent track, while remaining usable.

## 5. Financial and plan doctrine

- BVRB3R supports only **Full Booth Rent** and **AutoBooth Rent** for shop–barber relationships.
- Public copy must not imply commission, percentage splits, revenue sharing, or shop ownership of barber service revenue or tips. <!-- doctrine-allow -->
- Owner dashboards/marketing may describe booth-rent receivables and shop-owned sales. Barber service price, service proceeds, and tips are barber money and must not be labeled as owner/shop revenue.
- Do not market a `Free` tier. The exact zero-cost tier is **Standard $0**. Preferred Client sentence: **Client Standard is $0.**
- The BVRB3R platform fee is **5% of eligible transactions**. Do not claim that a `$40` service automatically produces a `$40` barber payout.
- **100% of the client-confirmed tip belongs to the barber.** Do not describe tips as shop revenue or a split.
- Card-processing charges, taxes, refunds, disputes, and other authorized adjustments must be presented separately and only where the implementation can substantiate them.
- Payout timing depends on Stripe Connect account eligibility, settlement, payout schedule, risk holds, weekends, and bank timing. Never guarantee same-day or instant payout.

## 6. Landing closer and review mode

- With owner-review mode off, the public closer uses the normal public **Book a cut** path and public supporting copy. It must not show `Owner review sign in` or private-review language.
- With owner-review mode on, the private sign-in replacement may render, but it may only replace the CTA/note. The approved closing headline and page composition remain unchanged.

## 7. Required visual proof

Capture and inspect the following exact viewports at 100% browser zoom:

| Viewport | Required routes |
| --- | --- |
| `1920×1080` | `/` at 0%, 18%, 42%, 64%, 88%, and final scroll; `/culture`; `/discover?entry=guest`; `/for-barbers`; `/for-shops` |
| `1440×1024` | The same public route set, with `/` at hero, impact/reveal, and final CTA |
| `390×844` | The same public route set, mobile menu open/closed, hero, one mid-scroll landing state, and final CTA |

Every proof pass must also confirm:

- no public grid, hatch, gold orb, or unapproved green haze;
- no horizontal page scroll, clipped CTA, or nav/content collision;
- Culture and Guest Discovery lead to different routes and honest headings;
- the pole scale, physical proportions, three independent glows, and caption spacing;
- Standard `$0`, 5% platform-fee, tip ownership, payout qualification, and booth-rent-only copy;
- no browser console error, hydration error, or Next.js error overlay;
- reduced-motion users receive readable static content and do not start the scroll animation.

## 8. Acceptance rule

A public parity claim is **Pass** only when lint, typecheck, the focused public-site tests, a production build, and the required viewport evidence all pass. “Matches the frozen reference” by itself is not acceptable proof because the overrides in this file intentionally correct that reference.
