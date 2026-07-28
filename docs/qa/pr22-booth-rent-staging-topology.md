# PR22 Booth Rent Staging Topology

PR22 preview verification runs against an isolated environment before merge:

- Git branch: `feat/booth-rent`
- Vercel environment: Preview, scoped to the Git branch
- Supabase project: `release-v22-staging` (`spplhijqebcqcoqjijjn`)
- Production data: prohibited

The preview configuration overrides only the Supabase URL, publishable key,
media bucket, and server-side service-role key. Secret values are stored only
in Vercel and Supabase and must never be committed.

## Required release proof

The package may merge only when all of the following are true:

1. The Vercel deployment is bound to the exact PR head.
2. The branch-specific preview reads and writes only the isolated Supabase
   project.
3. Agreement acceptance, card and cash rent contributions, stop-at-zero,
   reversal idempotency, reconciliation, audit, Realtime, and RLS checks pass.
4. GitHub CI, Vercel build/runtime checks, and the PR22 release snapshot pass.
5. Production receives only the canonical PR22 migrations; staging-only
   compatibility migrations must not be promoted.
