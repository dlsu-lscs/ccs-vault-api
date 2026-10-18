# Deployment notes

## Container
- Build: `docker build -t ccs-vault-api .` (multi-stage; base image pinned by digest, bumped by Dependabot).
- Run: `docker run -p 3001:3001 -e PORT=3001 ccs-vault-api` (starts with `node dist/server.js`, non-root user).
- No secrets or `.env` files are in the image; supply env vars at runtime (Dokploy environment). See `environment.md`.
- Dokploy settings to use: build type Dockerfile, path `./Dockerfile`, container port `3001`, health check path `/health`.

## Health checks
| Endpoint | Meaning | Healthy response |
|---|---|---|
| `GET /health` | Liveness: the process is up and answering | `200 {"status":"ok"}` |
| `GET /ready` (not built yet) | Readiness: DB reachable (`SELECT 1`) | `200`, or `503` with no details |

Responses never include env values, connection strings or stack traces. Add `/ready` when `pg` is first used (#24).
