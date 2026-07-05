# V1 Release Candidate Evidence Commands

Date: 2026-07-05

These commands define the local PR #60 evidence lock. They do not replace live
deployment, provider, or Supabase evidence.

## Git Gate

```bash
git status --short
git log --oneline -1
git merge-base --is-ancestor 202d774d6ed9e26f110bf4c4d96a4da3f573b42e HEAD
```

## Local Validation

```bash
npm run lint
npm run typecheck
npx vitest run tests/unit/v1-release-candidate-lock.spec.ts
npx vitest run tests/unit/v1-end-to-end-regression-pack.spec.ts
npm run build
git diff --check origin/main..HEAD
```

## Representative V1 Proxy Evidence

```bash
npx vitest run tests/unit/v1-end-to-end-regression-pack.spec.ts tests/unit/pwa-service-worker.spec.ts tests/unit/pwa-provider.spec.tsx tests/unit/pwa-manifest.spec.ts tests/unit/mobile-action-guard.spec.ts tests/unit/mobile-engine.spec.ts tests/unit/mobile-links.spec.ts tests/unit/native-bootstrap.spec.ts tests/unit/support-issue-intake.spec.ts tests/unit/support-issue-intake-route.spec.ts tests/unit/notification-consent.spec.ts tests/unit/paywall-entitlement-regression.spec.tsx tests/unit/subscription-settings.spec.tsx tests/unit/onboarding-final-activation.spec.ts tests/unit/onboarding-final-activation-evidence.spec.ts tests/unit/onboarding-final-activation-ui.spec.tsx tests/unit/booking-form.spec.tsx tests/unit/booking-mutation-routes.spec.ts tests/unit/core-booking-loop-regression.spec.ts tests/unit/freelance-client-booking-loop.spec.ts tests/unit/payments-routes.spec.ts tests/unit/payment-domain.spec.ts tests/unit/stripe-payment-record.spec.ts tests/unit/fintech-webhook-service.spec.ts tests/unit/stripe-webhook-entitlements.spec.ts tests/unit/architect-mission-control-foundation.spec.ts tests/unit/architect-mission-control.spec.tsx tests/unit/architect-rls-evidence-view.spec.ts tests/unit/rls-disabled-evidence-cleanup.spec.ts tests/unit/kiosk-routes.spec.ts tests/unit/kiosk-mode-screen.spec.tsx tests/unit/guest-entry.spec.tsx tests/unit/guest-booking-lookup.spec.tsx tests/unit/public-home-routing.spec.tsx tests/unit/public-barber-profile.spec.tsx tests/unit/public-shop-profile.spec.tsx tests/unit/messages-routes.spec.ts tests/unit/client-messages-screen.spec.tsx
```

## Safety Diff

```bash
git diff 202d774d6ed9e26f110bf4c4d96a4da3f573b42e HEAD -- "*.sql" "supabase/migrations/**" "middleware.ts" "stripe/**" "app/api/stripe/**" "lib/stripe/**" "lib/entitlements/**" "lib/payments/**" "app/api/payments/**" "lib/supabase/**"
```

Expected result: no output.

## Scope Diff

```bash
git diff --stat 202d774d6ed9e26f110bf4c4d96a4da3f573b42e HEAD
```

Expected result: documentation and PR #60 unit guard only.

## Manual Evidence Still Required

- Current production deployment status and commit.
- Live environment configuration presence without exposing secrets.
- Live Supabase/RLS posture read-only.
- Stripe/provider posture read-only.
- Source Vault private-source review.
- Founder decision on PR #57 and PR #59 evidence ceiling.
