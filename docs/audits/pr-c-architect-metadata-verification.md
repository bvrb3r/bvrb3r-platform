# PR-C Architect Metadata Verification

Run the read-only verification command:

```bash
npm run verify:architect-metadata
```

Required environment:

- `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ARCHITECT_USER_ID` or `ARCHITECT_USER_EMAIL`

Passing result:

- `status: "pass"`
- `appMetadataBvrb3rAccess: "architect"`
- `mappedAppMetadataBvrb3rAccess: "architect"`
- `accountStatus: "active"`
- `accessDecision.source: "app_metadata"`

Failing result when metadata is missing:

- `status: "missing_app_metadata"`
- `accessDecision.source: "none"`

Architect access requires Supabase Auth `app_metadata.bvrb3r_access = "architect"`, mapped into the domain user as `appMetadata.bvrb3r_access`. `user_metadata` does not grant Architect access. Active `accountStatus` is still required before app metadata or the temporary bridge can pass.

The temporary legacy bridge remains for lockout protection, but it is not the canonical path and should not be treated as seeded Architect metadata proof.
