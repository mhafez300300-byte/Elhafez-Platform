# Core Change Request #11 — Public Files Reader Contract for Business Modules

Status: APPROVED FOR IMPLEMENTATION
Owner approval: 2026-09-10
Starting main SHA: 2a8dbaa7e8ab665e0e8c59cd7fa92810ef80ec82
Core baseline before change: bd0c3e7faa09a297c55fe19bf395393a67a3cf15
Implementation branch: core/files-public-reader

## Genuine Core Defect
Business Modules may only collaborate with another module through `@elhafez/<module>/contracts`. Files previously exposed data types but no public application reader/token for validating a file reference in company/branch scope. Direct use of `FilesService`, repository, storage or Prisma is architecturally forbidden.

The old public `FileRecordView` also contained `storageKey` and `checksumSha256`, which are persistence/storage details not required by Business Module collaboration.

## Approved Generic Contract
`@elhafez/files/contracts` owns:

- `FILE_READER` injection token.
- `FileAccessScope` with optional `companyId` / `branchId` dimensions.
- safe `FileSummary` with identity, display metadata, scope metadata and creation time only.
- `FileReader.getFileSummary(fileId, scope)`.
- `FileReader.isFileAccessible(fileId, scope)`.

The contract is domain-neutral and contains no Products-specific behavior.

## Scope Semantics
The existing nullable file scope columns are preserved; no schema migration is required.

- Stored `companyId = null` means the file is not restricted to one company.
- Stored `branchId = null` means the file is not restricted to one branch.
- Any non-null stored scope dimension must exactly match the requesting scope.
- Therefore a global file (`companyId = null`, `branchId = null`) is visible in any scope.
- A company file (`companyId = X`, `branchId = null`) requires company X and is visible from any branch within X.
- A branch file (`companyId = X`, `branchId = B`) requires both X and B.
- Missing and inaccessible files both return `null` / `false` from the public reader to avoid leaking existence across scopes.

## Encapsulation
`storageKey` and `checksumSha256` are moved to an internal persisted record type under the Files backend application layer. Files storage/repository/infrastructure continue to use them internally. Public list/upload/download metadata and the Business Module reader do not expose those persistence fields.

`FilesModule` binds `FILE_READER` to the existing `FilesService` using `useExisting` and exports the token. Composition roots can wire Files capability into a consuming module without that module importing Files internals.

## Required Verification
- valid accessible file.
- missing file.
- wrong company.
- wrong branch.
- global/company/branch behavior.
- safe public summary without persistence internals.
- public token is injectable through composition.
- Business Module contracts-only import is accepted.
- direct Files root/backend/service import is rejected.
- Customers regression.
- Suppliers regression.
- frozen install.
- Prisma generate and migrations, including empty database.
- lint.
- strict typecheck.
- unit tests.
- architecture tests.
- Core integration tests.
- transaction rollback tests.
- authentication tests.
- permission scope regression tests.
- production build.

No Railway deployment is authorized by this Core change.
