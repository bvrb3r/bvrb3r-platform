# PR 149 dependency and scheduler remediation

Prepared October 29, 2026. Draft branch only; no production deployment authorized.

## Security changes

- Next.js and eslint-config-next: 15.5.22 → 15.5.28.
- Capacitor Android, core and CLI: 8.4.2 → 8.4.3, kept aligned.
- Sharp override: 0.35.3 → 0.35.5.
- Lockfile updates: qs 6.15.3 → 6.17.1; source-map-js 1.2.1 → 1.2.2.
- Zod: 3.25.76 → 4.6.7. The advisory GHSA-mrhx-c7xc-m3w5 lists
  4.6.6 as the first patched release; there is no patched v3 release listed.
- Form resolver: 3.x → 5.2.2 for Zod 4 support. Existing locked
  react-hook-form 7.83.0 satisfies its >=7.55 peer requirement.
- Record schemas now specify string keys. UUID-shaped identifier validation uses
  Zod 4's guid validator to retain the previous acceptance of non-RFC variant
  identifiers; authorization and database checks remain unchanged.
- No audit suppression, force-fix, skipped gate or use of legacy zod/v3.

## Scheduler configuration

Keep vercel.json unchanged:

| Endpoint | UTC schedule | Authentication |
| --- | --- | --- |
| /api/cron/account-privacy | 0 * * * * | Bearer CRON_SECRET |
| /api/calendar-sync/scheduled | * * * * * | Bearer CALENDAR_SYNC_CRON_SECRET or CRON_SECRET |

Vercel Pro supports both schedules. Hobby permits only daily schedules and rejects
this configuration before the build. Upgrade the existing team to Pro through
the owner's billing controls to preserve both cadences. No paid plan change has
been made by this remediation. Cron functions still incur platform usage.

Do not replace these schedules with daily jobs, disable crons or remove them to
make the preview green. Vercel runs cron jobs against production deployments;
the preview is for inspection and must not become another production worker.

An external scheduler is an alternative only after an explicit migration:
provision a service supporting one-minute execution, send authenticated HTTPS
requests to the production endpoints at the existing cadences, verify secret
handling, timeout/overlap behavior, failure alerts and actual worker effects,
then coordinate cutover without duplicate invocations. GitHub Actions scheduling
does not provide the required one-minute cadence. No external migration is
installed or claimed operational here.

## Access and verification

The connected Vercel account lists team_71DOymyxcPqMUoXeK8I7paSS, but project
prj_uykyMJRzD0x7XKZnAvs17sdjWsd6 and bvrb3r-platform both return 404;
the team's matching project list is empty. The provided deployment also returned
404. Restore project access for the Vercel connection or confirm the project was
moved. Do not create a replacement project or attach the production domain.

After project access and plan support are available, deploy the exact draft head
to Preview, record its READY deployment URL and SHA, inspect /kiosk and the Square
handoff, and confirm production's deployment/domain assignments are unchanged.
Never describe https://bvrb3r.app/kiosk as this preview.

No live scheduler execution was triggered: these endpoints can alter real data.
Payment reconciliation, staff assignment, iPad reset and cross-origin customer
data clearing remain separate release gates in square-booking-kiosk.md.

References:
- https://vercel.com/docs/cron-jobs/usage-and-pricing
- https://vercel.com/docs/cron-jobs/manage-cron-jobs
- https://github.com/advisories/GHSA-mrhx-c7xc-m3w5
- https://zod.dev/v4/changelog
