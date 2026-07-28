# BVRB3R Platform Specification

`SPEC.md` is the MVP delivery contract for the current release line. Long-range product architecture, expansion strategy, and schema evolution guidance now live in `VISION.md`.

## MVP summary

BVRB3R Platform is a mobile-first operating system for The BVRB3R Shop(TM) & Co. The current release focuses on the barbershop core: booking, appointments, front-desk operations, checkout, compensation visibility, owner reporting, and Supabase-backed multi-role operations.

## Current release goals

- Run daily barbershop operations across multiple locations.
- Support Full Booth Rent and AutoBooth Rent in the same business. These are the only supported shop-barber financial models.
- Protect owner-level financial and permissions controls.
- Create a frictionless booking experience for clients on mobile.
- Give each role a focused dashboard with only the controls they need.
- Use Supabase for auth, database, storage, realtime, and row-level security.
- Keep the MVP easy to run locally in demo mode or full Supabase mode.

## Runtime decisions

- Supabase is the default backend architecture for auth, Postgres data, storage buckets, RLS, and realtime.
- Demo mode remains available for zero-secret local startup using the same operational contracts.
- Stripe remains abstracted behind provider adapters so deposits and saved payment method setup do not leak sensitive handling into UI code.
- Zustand is reserved for UI state, optimistic interactions, and local smoothing rather than being the source of truth for live shop operations.

## BVRB3R Platform Expansion Architecture

The current MVP sits inside a larger long-range architecture built around three ecosystems:

- client
- barber
- owner

These ecosystems share foundational engines:

- identity
- booking
- payments
- payouts
- relationships
- analytics
- marketing

The next major expansion layer is the BVRB3R Marketplace: the discovery network that connects clients to barbers and shops at scale.

### Current codebase comparison

#### Implemented features

- authentication and role-aware dashboard access
- booking engine with appointments, availability, waitlist support, and walk-in operations
- basic barber operational profiles tied to services, availability, and compensation type
- owner and manager dashboards with persisted operational analytics
- payment and rent rails for deposits, checkout totals, booth-rent visibility, and AutoBooth rent-application snapshots
- multi-location basics through locations, staff assignments, and scoped reporting

#### Partially implemented features

- barber profiles beyond core booking and scheduling data
- loyalty and retention scaffolding
- queue management beyond the existing front-desk live board and walk-in queue
- analytics depth across all roles and business views
- marketing automation and messaging foundations
- saved payment method persistence lifecycle and payout depth
- public-brand surfaces that could later host marketplace discovery

#### Missing features

- discovery feed
- map mode
- `Get a Haircut Now` instant-discovery flow
- public barber marketplace profiles with trust-rich reputation data
- style discovery pages and haircut-specific search
- marketplace ranking algorithm
- marketplace growth or monetization features
- marketplace safety tooling
- referral system
- trust-layer profile data such as verified licenses, specialties, portfolio galleries, distance, and ranking signals
- general-ledger financial architecture where every financial event becomes a ledger entry
- hybrid compensation and payout scheduling model
- relationship-engine tables across client, barber, shop, and owner entities
- enterprise multi-location controls above the current shop-level model
- AI insights and franchise infrastructure

#### Future roadmap items

- loyalty, referrals, marketing campaigns, queue-management expansion, and analytics improvements
- multi-location enterprise support
- barber discovery marketplace
- AI insights
- franchise infrastructure
- marketplace feed, map, ranking, trust, monetization, and growth loops

## Release scope

### Implemented and active

- public marketing site and auth entry points
- client booking flow with location, barber, service, add-ons, deposit summary, cancellation policy acknowledgment, and waitlist support
- role-aware dashboards for owner, manager, front desk, barber, and client
- live appointment board, walk-in queue, check-in, service completion, and checkout flow
- payment-plus-tip capture flow through the operational lifecycle
- AutoBooth rent-application summary and booth-rent ledger visibility
- persisted workflow events, compensation snapshots, and owner analytics rails
- owner and manager reporting views backed by persisted operational data
- Supabase-ready schema, storage bucket config, auth sync trigger, RLS extensions, and realtime publication wiring
- Stripe-ready provider abstraction and API routes for deposit and saved-payment setup

### In scope but still maturing

- browser and staging QA for real multi-user release certification
- deeper canonical reporting alignment between the live operations tables and the UUID-based domain schema
- stronger session-scoped RLS usage in operations reads and writes

### Explicitly deferred to future phases

- loyalty expansion
- referrals
- campaign automation
- retail inventory depth
- messaging center
- franchise, barber school, salon, and BVRB3R Bus operating modules
- discovery marketplace and AI insights
- marketplace feed, map mode, trust, ranking, and monetization systems

## Primary roles in the MVP

### Owner

- views global performance, compensation, profitability, and audit activity
- manages protected business settings, locations, staff roles, and financial rules

### Store manager

- runs daily operations at assigned locations
- monitors schedules, performance, reviews, incidents, inventory, and approvals
- cannot alter owner-protected financial structures

### Front desk

- handles appointments, walk-ins, check-ins, check-outs, and client record management
- uses the fastest operational workflow in the product

### Barber

- manages availability, appointments, notes, service execution, rebooking, and personal compensation visibility
- Full Booth Rent and AutoBooth Rent variants remain role-scoped

### Client

- books services, joins waitlists, views history, favorites barbers, and manages profile preferences

## MVP acceptance criteria

- every primary role has a dedicated dashboard route and meaningful seeded content
- booking logic surfaces service duration, deposit requirement, estimated total, and waitlist support
- front desk can check in a client and complete checkout with payment and tip capture
- barber workflow can complete the service lifecycle
- compensation and owner reporting reflect persisted workflow activity
- sensitive payment logic stays behind provider abstractions
- Supabase migrations include auth-linked profile automation, storage setup, RLS policies, operational persistence, and realtime publication wiring
- the app can run in quick-start demo mode or full local Supabase mode

## Release note

The current codebase is build-green and milestone-complete through Milestone 9 at the code level. Human browser or staging QA and release certification still remain outside the scope of this document and are tracked in `PLANS.md`, `TODO.md`, `QA_MANUAL_CHECKLIST.md`, and `RELEASE_CERTIFICATION.md`.