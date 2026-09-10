# STEP 2B — Runtime Verification

Status: **NOT VERIFIED**.

The Core source is now persisted in the permanent GitHub repository. `.github/workflows/core-runtime-verification.yml` is the authoritative runtime gate and uses PostgreSQL 16.4 plus pinned Node/pnpm versions.

Required final gates: INSTALL, LOCKFILE, LINT, TYPECHECK, UNIT, ARCHITECTURE, INTEGRATION, EMPTY DATABASE MIGRATION, PRODUCTION BUILD. The workflow also executes dedicated transaction rollback, authentication, and permission-scope regression gates.

This file must not be changed to a verified state until the committed-lockfile CI run passes every required gate.
