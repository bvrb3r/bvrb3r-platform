# Store Launch Checklist

## Identity and packaging

- [ ] Confirm app name, short name, bundle id, package name, scheme, and universal-link host match release targets.
- [ ] Confirm icon inventory exists for iPhone, Android, and PWA contexts.
- [ ] Confirm splash assets and safe-area launch treatment are ready for store review builds.
- [ ] Confirm `/.well-known/assetlinks.json` and `/apple-app-site-association` validate against release identities.

## Screenshot inventory

- [ ] Marketing landing screen
- [ ] Discovery feed
- [ ] Public barber profile
- [ ] Booking flow
- [ ] Client dashboard
- [ ] Barber dashboard
- [ ] Front desk dashboard
- [ ] Manager dashboard
- [ ] Owner dashboard
- [ ] Push permission or alert proof screen where allowed

## Store metadata scaffold

- [ ] iOS App Store title, subtitle, keywords, and promo text drafted.
- [ ] Google Play title, short description, and full description drafted.
- [ ] Privacy policy URL and support URL confirmed.
- [ ] Category, age rating, and marketplace-service descriptions reviewed.
- [ ] Trust, verification, and safety claims reviewed for accuracy.

## Privacy and permissions review

- [ ] Push permission rationale reviewed.
- [ ] Notification usage is described consistently across App Store and Play metadata.
- [ ] Deep-link domains, bundle ids, and package names match production configuration.
- [ ] Any camera, photo, or storage permissions for future verification uploads are documented if enabled.
- [ ] Sensitive verification documents remain private and never exposed through public routes.

## Delivery providers and production config

- [ ] `NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, and `WEB_PUSH_SUBJECT` configured.
- [ ] `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and either `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM_NUMBER` configured.
- [ ] `RESEND_API_KEY` and `RESEND_FROM_EMAIL` configured.
- [ ] `DELIVERY_ENVIRONMENT` set correctly for staging or production.
- [ ] `NEXT_PUBLIC_IOS_BUNDLE_ID`, `IOS_TEAM_ID`, `IOS_KEY_ID`, `IOS_PRIVATE_KEY`, and `APNS_USE_SANDBOX` configured.
- [ ] `NEXT_PUBLIC_ANDROID_PACKAGE_NAME`, `ANDROID_SIGNING_SHA256`, `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`, and `FCM_SENDER_ID` configured.

## Wrapped-app validation

- [ ] `capacitor.config.ts` matches the target environment.
- [ ] Wrapped bootstrap metadata from `/api/mobile/native/bootstrap` matches release settings.
- [ ] Deep-link opens validated in browser, installed PWA, and wrapped-native flows.
- [ ] APNs or FCM token bridge traffic validates against `/api/mobile/native/tokens`.

## QA and certification gate

- [ ] `QA_MANUAL_CHECKLIST.md` completed.
- [ ] `RELEASE_CERTIFICATION.md` completed.
- [ ] `RELEASE_CANDIDATE_CERTIFICATION.md` completed.
- [ ] `MOBILE_DEVICE_QA.md` completed.

## Release command gate

- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm run test`
- [x] `npm run build`
- [x] Smoke-test `/manifest.webmanifest`, `/sw.js`, `/api/mobile/deep-links`, `/api/mobile/native/bootstrap`, `/api/mobile/push/subscriptions`, `/api/mobile/native/tokens`, and `/api/engagement/deliveries`

## Submission readiness

- Product: pending human review
- Engineering: build-green
- QA: pending real-device sign-off
- Operations: pending credential and store-asset completion
- Final go/no-go: no-go until real-device QA, provider credentials, and certification sign-off are complete
