---
name: security-audit
description: Scan the PunkPay codebase for OWASP top 10 vulnerabilities, dependency issues, and secret leaks
---

# Security Audit Skill

Perform a comprehensive security audit of the PunkPay codebase:

## Checks to perform:

1. **Injection** — Search for unsanitized user input in SQL queries, OS commands, and HTML output
2. **Broken Authentication** — Verify password hashing (Argon2), session management, TOTP implementation
3. **Sensitive Data Exposure** — Check for hardcoded secrets, unencrypted sensitive data, missing encryption at rest
4. **XSS** — Look for dangerouslySetInnerHTML, unescaped output in React components
5. **CSRF** — Verify CSRF tokens on state-changing endpoints
6. **Security Misconfiguration** — Check headers, CORS, cookie flags, Content-Security-Policy
7. **Dependency Vulnerabilities** — Run `npm audit` and check for known CVEs
8. **Secret Leaks** — Grep for API keys, private keys, passwords in code (not .env files)
9. **Bitcoin-specific** — Verify seed is zeroed after use, no private key logging, proper address validation
10. **Rate Limiting** — Verify rate limits on auth endpoints, transaction creation, API calls

## Output format:
For each finding, report: severity (CRITICAL/HIGH/MEDIUM/LOW), location (file:line), description, and recommended fix.
