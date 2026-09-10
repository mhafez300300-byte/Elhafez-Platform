# Module Standard

Every module is created from `templates/module-template` using `node scripts/create-module.mjs <module-name>` and uses exactly:

```text
modules/<name>/
  backend/
    domain/
    application/
    infrastructure/
    api/
  frontend/
  contracts/
  tests/
  package.json
  index.ts
```

## Public surfaces
- `@elhafez/<module>`: backend composition root for `apps/api` only.
- `@elhafez/<module>/frontend`: frontend composition surface for `apps/web` only.
- `@elhafez/<module>/contracts`: the module's public cross-module contracts.
- `@elhafez/platform-contracts`: platform-wide contracts only.

## Business module persistence ownership

Business modules that own Prisma models declare them in:

`prisma/schema/modules/<module-name>.prisma`

The schema filename is the ownership declaration. Every Prisma model declared in that file is owned only by the matching `modules/<module-name>/` module. A Business Module may access its owned Prisma models only from its own `backend/infrastructure/` layer. It may not access Core-owned models or models declared by another Business Module directly.

Adding a new Business Module does not require adding its name to an architecture allowlist. The generic architecture verifier discovers the module from `modules/<module-name>/`, validates the required module structure, and discovers its model ownership from the matching Prisma schema file when persistence is present.

Core model ownership remains protected by the approved Core baseline and is not transferred through Business Module schemas.

## Mandatory rules
Contracts are the only cross-module import surface. Application services depend on repository/provider ports, never Prisma or `packages/database` directly. Repositories and database calls stay in the owning module infrastructure. Domain code has no application/infrastructure/API dependency. Module frontend never imports module backend. Platform packages never depend on modules. Apps compose modules; they do not reach module internals by relative path. No direct table/repository/internal-code access across modules.

No placeholder page, dead button, fake feature, or documentation-only implementation counts as complete. Permissions, validation, audit and tests are added whenever the capability requires them.

## Definition of Done
Domain rules implemented; application use cases implemented; adapters implemented; API/UI present only when functional; permissions/audit wired where required; owned persistence migration supplied; unit/integration/regression tests supplied; architecture tests pass. Every repaired bug gets a regression test.
