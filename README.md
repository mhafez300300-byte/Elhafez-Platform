# Elhafez Platform

Commercial platform baseline for future Elhafez applications. This repository currently contains **Platform Core only**.

## Current scope
Database infrastructure, Authentication, Users, Roles, Permissions, Companies, Branches, Audit, Transactions, Validation, Unified Errors, Events, Files, Printing/PDF, Notifications, Runtime Configuration, Logging, Testing Infrastructure, and the mandatory Module Template.

The following are intentionally absent until Core approval: Customers, Suppliers, Products, Inventory, Purchases, Sales, POS, Accounting, Reports, and all other business modules.

## Architecture
`ARCHITECTURE.md`, `MODULE-STANDARD.md`, and `TESTING-STANDARD.md` are the approved baseline. Cross-module access is contracts-only. PostgreSQL is shared at application level while table ownership remains explicit per module.

## Runtime verification status
**NOT VERIFIED** until GitHub Actions completes every required gate successfully with the committed frozen `pnpm-lock.yaml`.

Run locally with a real PostgreSQL instance:

```bash
corepack enable
corepack prepare pnpm@10.15.1 --activate
pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm db:migrate
pnpm db:seed
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:architecture
pnpm test:integration
pnpm build
```

No default production credential is included. To create the first Platform Owner during an explicit seed, provide `BOOTSTRAP_ADMIN_EMAIL` and a `BOOTSTRAP_ADMIN_PASSWORD` of at least 12 characters.
