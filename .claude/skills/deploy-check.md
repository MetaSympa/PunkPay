---
name: deploy-check
description: Pre-deployment checklist for PunkPay - env vars, migrations, Docker health, and build verification
---

# Deploy Check Skill

Run through the pre-deployment checklist:

1. **Environment Variables** — Verify all required env vars are set (DATABASE_URL, REDIS_URL, AUTH_SECRET, MASTER_ENCRYPTION_KEY, BITCOIN_NETWORK, MEMPOOL_API_URL)
2. **Database** — Check pending migrations, verify schema is in sync
3. **Build** — Run `npm run build` and check for TypeScript errors
4. **Docker** — Verify docker-compose services are healthy (postgres, redis, signal-cli)
5. **Dependencies** — Check for outdated or vulnerable packages
6. **Bitcoin Network** — Confirm BITCOIN_NETWORK matches intended deployment target
7. **Security** — Verify MASTER_ENCRYPTION_KEY is properly generated (64 hex chars), AUTH_SECRET is set
8. **Workers** — Verify worker process can connect to Redis
