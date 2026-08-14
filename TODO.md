# TODO

`TODO.md` tracks deferred work against the long-range architecture in `VISION.md`.

## Road Account Setup Release Follow-up

- Publish the reconstructed Road application bundle as an exact-head stacked pull request after installing and authenticating the required GitHub CLI.
- Run the complete lint, typecheck, unit, production-build, Vercel preview, and human QA gates against the exact commit that will merge.
- Complete a signed-in production walkthrough for Client, Barber, and Shop Owner Road home entry, corrective actions, autosaved progress, sequential locks, and role isolation.
- Exercise the signed verification upload capability against deployed Supabase Storage and confirm the stored MIME and byte-size integrity checks with real files.
- Monitor reconciliation errors, Road invariant queries, setup-truth event growth, and badge single-fire behavior after application release.

## Phase 1: Core platform

- Execute a real human browser walkthrough against a staging-like Supabase environment and complete sign-off in `QA_MANUAL_CHECKLIST.md` and `RELEASE_CERTIFICATION.md`
- Validate realtime subscriptions and RLS behavior with real Supabase auth users for every production role
- Add browser automation for the six-step workflow, realtime synchronization, and stale-edit conflict handling
- Reduce admin-client dependence inside the operations API so more reads and writes run directly through session-scoped Supabase RLS paths
- Convert the live text-reference operations tables into canonical UUID-linked Supabase relational records shared with the broader domain schema
- Expand barber profiles from operational booking data into stronger professional profile records without disrupting the current MVP flows

## Marketplace Growth Follow-up

- Persist marketplace profiles, visibility, service popularity, and discovery search activity into live Supabase-backed application flows instead of in-memory foundation state
- Deepen style discovery into image-led feeds, richer style pages, and style-to-booking search refinements
- Connect public profile booking CTAs to preselected barber flows in `/booking/new`
- Add owner and booth-rent management UX for marketplace visibility, featured placement, and trust badges
- Add marketplace analytics for profile conversion, click-through, discovery-to-booking rate, and most-booked service trends


## Engagement Architecture Follow-up

- Persist loyalty accounts, transactions, follows, recommendations, reputation scores, ranking snapshots, and growth recommendations into live Supabase-backed application flows instead of in-memory scaffold state
- Connect engagement event recording to real booking, checkout, review, referral, and public-profile interactions
- Expand provider execution from email, SMS, and web push into native APNs and FCM bridge delivery
- Add city-aware personalization for discovery feed sections, followed-barber updates, and trending surfaces
- Add boosted visibility controls, richer referral reward automation, and notification delivery for follow, referral, and rebooking loops
## Trust, Verification, and Safety Follow-up

- Replace placeholder verification document paths with secure Supabase Storage upload flows and review tooling
- Add live review-submission eligibility checks tied directly to completed bookings and moderation writes
- Add barber self-service verification submission UX and owner-safe verification review actions
- Add client-safe dispute submission surfaces where appropriate without exposing internal moderation tooling
- Add automated fraud scoring, trust-score refresh jobs, and moderation penalty rollups for ranking
- Add notification delivery for verification status changes, trust reminders, and safety-case updates

## Phase 2: Growth features

- Add loyalty accrual, redemption, and customer retention segmentation
- Add referral tracking, referral incentives, and referral reporting
- Add campaign automation tables and operational flows
- Connect Twilio and Resend notification pipelines for campaign execution
- Expand queue management beyond the current front-desk live board and walk-in queue
- Add broader analytics models for client, barber, location, marketing, and retention performance
- Add trust-layer profile fields for verified licenses, specialties, portfolio assets, ratings, reviews, distance, and next availability
- Add stronger relationship-engine tables for client-to-barber, barber-to-shop, client-to-shop, and owner-to-shop visibility and affinity
- Add canonical checkout orders, line items, discounts, taxes, refunds, and receipt records
- Persist Stripe customer and saved-payment method records from provider responses into canonical Supabase tables
- Replace demo-mode route landing with full Supabase session-driven guards and profile hydration
- Expand retail inventory and barcode-driven POS workflows
- Add messaging center and manager task board interactions
- Introduce a stronger scoped permissions model beyond role-only checks
- Deepen public barber profiles with verified media uploads, trust workflows, and richer public booking presentation

## Phase 3: Ecosystem expansion

- Add a business or organization layer above locations
- Add a generalized operating-unit model for shops, buses, school operations, salon concepts, suite operators, independent professionals, and franchise nodes
- Add enterprise multi-location controls, shared-staff governance, and unified analytics hierarchies
- Expand the discovery feed foundation into personalized, city-density-aware marketplace ranking and recommendation surfaces
- Extend the Marketplace Growth Engine with boosted placement controls, city-density rollout tooling, and marketplace monetization governance
- Complete full marketplace map mode provider integration for barbers, shops, and mobile professionals
- Expand `Get a Haircut Now` from heuristic foundation into realtime optimized matching and booking conversion tracking
- Add style discovery pages, style tags, style images, and style-to-barber search
- Add discovery marketplace ranking and trust systems
- Add featured placement, boosted visibility, and other marketplace monetization controls
- Add marketplace search history, client preferences, trending styles, and location search indexing
- Add marketplace fraud detection, verification, and dispute tooling
- Add AI analytics and marketplace intelligence
- Add franchise-level controls, royalties, and cross-brand analytics
- Add general-ledger tables so every financial action creates ledger entries
- Add hybrid compensation rules, payout scheduling, and tax-ready reporting architecture
- Build BVRB3R Bus operational mode
- Build barber school cohorts, attendance, curriculum, and compliance workflows
- Add membership subscriptions
- Add grooming-brand network and commerce integrations
- Add ecommerce and merch integrations
- Add advanced payroll, bonuses, payouts, and tax logic by jurisdiction

## Marketplace Activation and Monetization Follow-up

- Replace placeholder verification document references with signed Supabase Storage upload and review flows
- Connect Twilio, Resend, and push delivery providers to the new notification delivery ledger and retry state model
- Add billing, invoicing, and settlement rails for boost campaigns and featured placements
- Expand map discovery from the current synced shell into a fully polished provider-backed map experience
- Add city-density automation, launch thresholds, and seeded neighborhood rollout analytics
- Add barber and owner self-service controls for promoted placements, campaign pacing, and monetization governance
- Deepen trust-aware monetization analytics with cohort, city, and trust-score conversion slices

## Mobile Push and Native Activation Follow-up

- Add subscription rotation cleanup, expiration handling, and cross-device push preference management
- Validate install, push-permission, deep-link, and notification click-through behavior on real iOS Safari, Android Chrome, and wrapped-native shells
- Expand safe offline read caching and retry UX for already-viewed discovery, profile, and referral surfaces without queueing unsafe writes
- Add a full Capacitor wrapper project, native push bridge token sync, and store-pilot deep-link configuration
- Add splash-screen variants, screenshots, and app-store-ready distribution assets for future native deployment



## Native Distribution and Live Delivery Follow-up

- Implement real APNs and FCM outbound delivery once wrapped-native device tokens are available in staging
- Add queue workers or cron execution for scheduled notification retries and reminder delivery windows
- Validate association-file behavior against real iOS and Android release signing identities
- Add wrapped-native auth session QA and secure device-token rotation handling
- Expand owner-safe delivery reporting with provider success rate, retry rate, and failure diagnostics by channel

## Real Device QA and Store Submission Follow-up

- Validate hashed native token registration, refresh, and revoke flows against real iPhone and Android wrapped builds
- Implement real APNs and FCM outbound delivery using the new native token bridge once production credentials and wrapped builds are available
- Add secure token-rotation cleanup jobs and stale-token pruning for wrapped-native devices
- Complete human real-device QA, release-candidate certification, and store submission sign-off using the new checklist set
- Finalize store screenshots, splash variants, privacy copy, and submission metadata for App Store and Play release candidates
