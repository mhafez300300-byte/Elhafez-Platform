# Testing Standard

Required gates for Core and every release candidate:

1. Exact dependency install using committed `pnpm-lock.yaml` and `pnpm install --frozen-lockfile`.
2. Lint with zero warnings.
3. Strict TypeScript typecheck.
4. Unit tests.
5. Architecture tests.
6. Core integration tests.
7. Empty PostgreSQL database migration test.
8. Critical-flow E2E tests.
9. Production API and Web builds.

Status values are strict: `PASS` only when the exact gate was executed and passed; `FAIL` when it executed and failed because of the candidate; `NOT VERIFIED` when the environment prevents execution. Build success never upgrades another gate.

Architecture tests must reject circular module dependencies, cross-module internal imports, relative escapes into another module, frontend-to-backend imports, application-to-database/infrastructure imports, domain-to-application/infrastructure/API imports, API-to-infrastructure imports, platform-package-to-module dependencies, Web app imports of backend module roots, unsupported module structure, forbidden Core business modules, and direct Prisma access to tables owned by another module.

Any production bug fixed later must add a regression test reproducing the original failure before the fix is considered complete.
