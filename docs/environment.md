# Environment configuration

Variables marked "yes" are read by the code at runtime. The rest are planned and marked so; update this table when the code starts using them.

| Variable | Used by code | Secret | Phase | Purpose |
|---|---|---|---|---|
| `PORT` | yes | no | runtime | HTTP port (default 3001) |
| `NODE_ENV` | yes | no | runtime | Environment mode (`development`, `staging`, `production`, `test`) |
| `DATABASE_URL` | yes | yes | runtime | PostgreSQL connection string |
| `GOOGLE_CLIENT_ID` | yes | yes | runtime | Google OAuth Client ID for verifying ID tokens |
| `TEST_DATABASE_URL` | yes (tests) | no | test | Optional test PostgreSQL connection string (defaults to `.../ccs_vault_test`) |
| `ALLOWED_ORIGINS` | planned | no | runtime | Allowed frontend origins (CORS) |
| `R2_ACCOUNT_ID` | planned (#25) | no | runtime | Cloudflare account |
| `R2_ACCESS_KEY_ID` | planned (#25) | yes | runtime | R2 access key (server-side only) |
| `R2_SECRET_ACCESS_KEY` | planned (#25) | yes | runtime | R2 secret key (server-side only) |
| `R2_BUCKET` | planned (#25) | no | runtime | Bucket for the environment |

Nothing is needed at build time; `npm run build` only compiles TypeScript.

## Where values live

| Environment | Location | Owner |
|---|---|---|
| Development | local `.env` (gitignored), copied from `.env.example`; use a dev database/bucket, never production credentials | each developer |
| Staging | Dokploy staging application environment | TBD (confirm with project lead) |
| Production | Dokploy production application environment | TBD (confirm with project lead) |
| Deploy webhook (#26) | GitHub Actions environment secrets | TBD |

Staging and production must use separate databases, buckets and credentials. Never log or return env values.

## Open items
- Owners for staging/production secrets.
- Staging/production DB and R2 resources (not yet confirmed).
