---
name: db-review
description: Check Prisma schema for missing indices, N+1 queries, and data integrity issues
---

# Database Review Skill

Review database schema and queries:

## Checks:

1. **Missing Indices** — Find query patterns that would benefit from additional indices
2. **N+1 Queries** — Look for loops with nested database calls, suggest `include` or batch queries
3. **Data Integrity** — Verify foreign keys, unique constraints, cascade rules
4. **BigInt Handling** — Ensure satoshi amounts use BigInt consistently
5. **Migration Safety** — Check for destructive migrations, missing defaults on new columns
6. **Connection Management** — Verify Prisma client singleton pattern, connection pooling
7. **Transaction Safety** — Look for operations that should use Prisma transactions ($transaction)
