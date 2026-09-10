# Elhafez Platform Architecture Baseline

Status: **APPROVED BASELINE**. Changes require a real, documented technical reason and an architecture decision record.

## Stack
TypeScript everywhere; React frontend; NestJS backend; PostgreSQL; Prisma; pnpm monorepo; Modular Monolith. External dependency versions are exact and release installs are lockfile-controlled. No `latest`, caret, or tilde ranges are permitted.

## Responsibilities
`apps/` are composition roots only. `modules/` own Core/Business domains. `packages/` contain reusable domain-neutral platform infrastructure. `templates/` contains the mandatory real module generator template. `prisma/` contains the single application database schema/migrations with explicit module ownership. `tests/` contains cross-platform architecture, integration and E2E gates.

Prisma multi-file schemas are configured at `./prisma`. A small `prisma/schema.prisma` at that level holds only generator/datasource blocks because Prisma requires the main schema and `migrations/` to share the configured directory; the approved `prisma/schema/core.prisma` holds Core models and `prisma/schema/modules/` is reserved for explicitly approved future module schemas. This is the documented operational form of the approved Prisma tree.

## Module boundaries
A module may import another module only through `@elhafez/<module>/contracts`. Application-service collaboration is exposed as public interfaces/tokens in those contracts and wired through composition. Direct imports of another module's backend, frontend, domain, repositories, infrastructure, Prisma access, or internal files are forbidden.

Application and domain layers never import Prisma or `packages/database`; database adapters live only in the owning module infrastructure layer. Frontend never imports backend. Domain never imports application/infrastructure/API. Platform packages never import modules.

`packages/contracts` is for platform-wide public contracts. `modules/<name>/contracts` is for that module's public contracts only. `packages/config` loads environment/runtime configuration only; Core v1 contains no Business Configuration module.

## Data ownership and transactions
One PostgreSQL database is used per application. Every table has exactly one owning module. Cross-module identifiers may be stored as scalar IDs but do not grant direct data access. Cross-module validation/read collaboration uses public contracts/services/events. A module never changes another module's table directly.

Critical multi-write operations use `TransactionManager`: all writes commit together or all roll back. Transaction rollback behavior is covered by integration testing.

## Events and audit
Cross-module asynchronous collaboration uses `EventBus`. Auditable modules publish the public `platform.audit.requested` contract; Audit owns and persists `core_audit_records`. Audit payloads support actor, company, branch, entity, before/after state, metadata and request ID.

## Errors and validation
All API failures flow through typed `AppError` classes and `UnifiedErrorFilter`. Boundary input is parsed through the validation package; domain invariants remain inside domain objects/services.

## Security
Authentication uses bcrypt password hashing, signed access/refresh tokens, persisted hashed refresh sessions, rotation/revocation and token version checks. Authorization is permission-based with global/company/branch scopes. Inactive users, roles, companies and branches cannot grant effective scoped access. Platform-admin bypass exists only for platform ownership/bootstrap.

## Verification rule
A build is not evidence of readiness. Verification requires install, lockfile, lint, strict typecheck, unit, architecture, integration, empty-database migration, E2E for critical flows and production build. A required failed or unverified gate prevents a READY/PASS release declaration.
