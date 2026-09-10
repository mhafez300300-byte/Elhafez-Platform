# Elhafez Platform — Products / Drug Catalog — Approved Specification

Status: **APPROVED SPECIFICATION**
Module: `products`
Version: `1.0`
Platform Baseline: `2a8dbaa7e8ab665e0e8c59cd7fa92810ef80ec82`
Core Baseline: `bd0c3e7faa09a297c55fe19bf395393a67a3cf15`
Branch: `module/products`
Approved by Owner: **YES**
Owner Approval: `APPROVED + ADD CENTRAL EGYPT DRUG CATALOG`

This document is the Source of Truth for Products v1. No Products v1 requirement may be silently added, removed, weakened, or reinterpreted after this approval. Any scope change requires a **PRODUCTS MODULE CHANGE REQUEST**. Any genuine Core defect requires a separate **CORE CHANGE REQUEST** and Owner approval before Core modification.

## 1. Purpose

The Products module owns product and medicine master data for Elhafez Platform.

It owns two related but distinct catalogs inside the same Business Domain:

1. **Company Product Catalog** — the company-scoped operational master catalog used by future Inventory, Purchases, Sales/POS, Pricing and Reporting modules.
2. **Central Egyptian Drug Reference Catalog** — a platform-global Egyptian medicine reference catalog used as a trusted reusable reference source from which authorized companies can search, adopt/link medicines and keep provenance-aware reference metadata.

Products is responsible for stable product identity, descriptive data, medicine metadata, classifications, ingredients, dosage forms, manufacturers/brand owners, units and packaging conversions, barcodes, lifecycle status, image/file references, search, duplicate detection, import/export, bulk master-data update, central reference ingestion/adoption, permissions, audit, idempotency and public product-resolution contracts.

Products must **not** own stock quantities, batches/lots, expiry inventory, FEFO allocation, purchasing transactions, selling transactions, customer/supplier balances, accounting entries, actual company/branch price lists, discounts/promotions, realized profit or other transactional domains.

## 2. Architecture and Ownership Rules

- Implementation lives only under `modules/products/` and follows `MODULE-STANDARD.md` and `templates/module-template/`.
- Products-owned Prisma models are declared only in `prisma/schema/modules/products.prisma`.
- The Products schema filename is the ownership declaration for its Prisma models.
- Products may access its owned Prisma models only from `modules/products/backend/infrastructure/`.
- Products must never directly access another module's tables, Prisma models, repositories, internal services, infrastructure or private source files.
- Cross-module interaction is only through public contracts, application interfaces/services, or domain events.
- No circular dependencies.
- Company/branch/user identity required for authorization must come from authenticated context, not trusted arbitrary client identifiers.
- No Core change is approved by this specification.
- Files integration for product images must use the Files public contract only.
- Audit integration must use the approved platform audit contract/event mechanism only.
- Business permissions must use the public Permission Registration Contract; they must not be hard-coded into Core.

## 3. Product Scope Model

Products v1 supports both pharmacy medicines and non-drug products.

Top-level company product type:
- `DRUG`
- `NON_DRUG`

Configurable categories/tags may classify cosmetics, medical supplies, supplements, devices, general retail products and other company-specific groupings without forcing pharmacy-only semantics on every Elhafez Platform product.

Drug-only fields are applicable only when `productType = DRUG`.

## 4. Company Product Entity — Core Data

### 4.1 Identity

Required/approved fields and concepts:
- immutable internal `id`.
- authorized `companyId` scope.
- system-generated human-readable `productCode`, unique within company.
- `productType`: `DRUG` or `NON_DRUG`.
- required primary/display name.
- optional Arabic name.
- optional English name.
- optional trade/brand name where distinct.
- optional description.
- optional internal notes.
- optional link to one Central Egyptian Drug Reference record when the company product was adopted/matched from the central catalog.
- optimistic concurrency/version field.
- created/updated timestamps.

### 4.2 Classification

Products owns configurable company product master classification:
- hierarchical/configurable product category.
- zero or more product tags.
- optional manufacturer/brand-owner reference owned by Products master data.
- optional country of origin.

### 4.3 Product Image

- optional file/image reference through the approved Files public contract.
- Products may store only the approved scalar reference/identifier needed for integration.
- Products must not read/write Files internal persistence.

## 5. Drug / Medicine Profile

For company products of type `DRUG`, support as applicable:
- one or more active ingredients, including combination medicines.
- strength/value and strength unit per ingredient when applicable.
- dosage form such as tablet, capsule, syrup, cream, ampoule, vial, drops, inhaler or configured equivalent.
- route of administration when applicable.
- optional EDA/official registration number or equivalent regulatory identifier.
- optional ATC or equivalent reference classification.
- prescription classification such as OTC / prescription-required / controlled when configured.
- controlled/restricted medicine flag when applicable.
- optional cold-chain/storage-condition flag.
- optional storage notes or temperature guidance.
- optional medicine market status such as `AVAILABLE`, `DISCONTINUED`, `UNKNOWN`.
- optional public/reference catalog price.
- reference price source/provenance and last-verified timestamp where applicable.

Reference/public catalog price is informational master data only. Actual company/branch selling prices, price lists, discounts, promotions and transactional pricing history belong to future Pricing/Sales ownership.

## 6. Ingredients and Pharmaceutical Reference Data

Products owns the pharmaceutical reference data necessary to describe Products-domain entities:
- ingredient master records.
- dosage-form master records.
- optional route-of-administration master records.
- manufacturer/brand-owner master records.

These datasets must be searchable/configurable as applicable and must not carry supplier relationships, stock state, purchasing history or accounting information.

## 7. Units and Packaging

Each company product supports one or more units/package levels.

A product unit may include:
- immutable unit id.
- display name.
- short label.
- conversion factor to base unit.
- base-unit flag.
- default-sale-unit suggestion.
- default-purchase-unit suggestion.
- active flag.
- optimistic version.

Rules:
- exactly one active base unit per product before activation.
- base-unit conversion factor is exactly `1`.
- active non-base conversion factors must be positive and valid.
- multi-level packaging is supported, e.g. tablet -> strip -> box.
- unit/pack conversion is intrinsic product master data.
- future transactional modules must snapshot the conversion used by the transaction so later catalog edits do not rewrite historical transactions.
- default sale/purchase unit is only a product-master suggestion; consuming modules own actual transaction behavior.

## 8. Barcodes

Products owns company product/unit barcodes.

A barcode may include:
- normalized barcode value.
- barcode type/symbology when known, including EAN-13, EAN-8, UPC-A, UPC-E, GTIN-14, internal/custom or supported equivalent.
- associated product unit/package.
- primary-barcode flag.
- active flag.
- optional source/reference metadata.
- optimistic version.

Rules:
- barcode values preserve semantically significant leading zeroes.
- normalized active barcode ownership must never be ambiguous inside one company.
- one product may have multiple barcodes.
- one unit/package may have multiple valid alternate/historical barcodes when domain rules allow it.
- exact barcode lookup must be indexed/optimized for scanner and future POS usage.
- a normal retail barcode identifies product/package, not inventory batch.
- lot/batch and expiry belong to Inventory.
- future GS1/DataMatrix parsing may resolve a GTIN through Products while passing lot/expiry segments to Inventory without Products owning those segments.

Scanner UX requirement:
- when a scanner submits its normal terminator (for example Enter/Tab), exact barcode resolution must complete without unnecessary navigation or extra search clicks.
- ambiguous active company barcode ownership is forbidden by data rules rather than delegated to POS guessing.

## 9. Company Product Lifecycle

Operational statuses:
- `DRAFT`
- `ACTIVE`
- `INACTIVE`
- `ARCHIVED`

Rules:
- DRAFT products may be incomplete and are not available for normal downstream transactions.
- ACTIVE products satisfy activation invariants and are available to consuming modules.
- INACTIVE products remain readable but are unavailable for new normal downstream transactions unless the consuming module later has an explicitly approved exception.
- ARCHIVED products are hidden from default operational lists but remain searchable/viewable with permission.
- Products v1 has no normal hard-delete product action.
- medicine market status is separate from operational lifecycle; a discontinued medicine may remain an operationally valid master record for historical/inventory reasons.

## 10. Central Egyptian Drug Reference Catalog

### 10.1 Ownership and Scope

The Central Egyptian Drug Reference Catalog is part of the **Products module**, not a new Business Module.

It is platform-global reference data owned only by Products. It is not company stock, pricing, purchasing or accounting data.

A central medicine record may represent an Egyptian-market medicine/package reference and may include:
- immutable central reference id.
- canonical Arabic and/or English medicine name.
- trade/brand name.
- active ingredient composition.
- strengths and units.
- dosage form.
- route where available.
- manufacturer/brand owner.
- country/manufacturing metadata when available.
- EDA/official registration identifier when available.
- ATC/reference classification when available.
- prescription/controlled classification when available.
- package description and reference units.
- one or more GTIN/EAN/UPC/barcodes tied to central package references.
- official/public/reference price when source data provides it.
- market availability/discontinued status when source data provides it.
- source/provenance metadata.
- source record key.
- source effective/published date when available.
- source ingestion timestamp.
- source dataset version/import-session identifier.
- last verified timestamp.
- central record lifecycle: active/superseded/retired/quarantined or equivalent implementation semantics.

### 10.2 Provenance Is Mandatory

No central record may be presented as trusted Egyptian reference data without provenance sufficient to identify where it came from.

At minimum, central ingestion must preserve:
- source name/identifier.
- source dataset/import-session identifier.
- source record key when available.
- ingestion timestamp.
- source published/effective date when available.
- fields necessary to explain whether price/barcode/regulatory data came from that source.

The implementation must not invent regulatory IDs, prices or barcode data.

### 10.3 Source Governance

Products v1 must support controlled ingestion of Egyptian drug reference data from approved files/datasets through a real admin workflow.

A data source is not approved merely because it is found on the public internet. Licensing, provenance, source identity and data quality must be preserved.

Release claims must distinguish:
- **Central Catalog capability implemented and verified**, from
- **Central Catalog populated with a specific verified dataset**.

If no approved source dataset is available during BUILD/UAT, population must be reported as `NOT VERIFIED`/`BLOCKED`; the system must not silently seed fabricated or unverified medicine data.

### 10.4 Central Ingestion Workflow

Central catalog ingestion must support:
- CSV and/or XLSX when fully implemented and tested.
- explicit column mapping.
- preview.
- normalization.
- validation.
- source/provenance capture.
- strong-identifier conflict detection.
- barcode conflict detection.
- accepted/rejected/quarantined counts.
- row-level rejection/quarantine reasons.
- resumable/idempotent import-session semantics suitable for large datasets.
- dataset versioning/import-session traceability.

Central records with unresolved strong-identifier or barcode ownership conflicts must be quarantined/rejected so normal reference lookup never returns ambiguous trusted ownership.

### 10.5 Central Search

Authorized central search should support, as applicable:
- exact barcode/GTIN with highest priority.
- Arabic/English medicine name.
- trade/brand name.
- ingredient.
- strength.
- dosage form.
- manufacturer.
- EDA/official registration identifier.
- ATC/reference code.

Central search must be designed for catalogs containing tens of thousands of records with server-side pagination/indexed search.

### 10.6 Company Adoption / Linking

An authorized company user can search the Central Egyptian Drug Reference Catalog and adopt a reference medicine into the company's own Product Catalog.

Adoption rules:
- adoption creates or links a **company-owned Product**; downstream modules never operate directly on a global central record.
- company `companyId` comes from authenticated scope.
- the company product may store the central reference id as a provenance link.
- the initial company product may copy approved reference fields such as names, medicine profile, package/unit suggestions, barcodes and reference price according to selected adoption options.
- company-specific values are owned by the company product after adoption.
- editing a company product never mutates the central record.
- central record updates never silently overwrite company overrides.
- when central reference data changes, the company may receive a compare/update proposal in Products; applying selected changes must be explicit, permission-guarded, audited and concurrency-safe.
- duplicate detection must run before adoption so the same central drug is not unintentionally duplicated in the same company.

### 10.7 Company Overrides

Company users may override company-owned master fields where their permissions allow it. Examples include company display name, local notes, category/tags, active company barcode decisions and local unit naming.

The central link/provenance must remain visible enough to distinguish:
- central reference value,
- company current value,
- whether the company value differs from the reference.

No company override changes the central reference source record.

### 10.8 Central Catalog Permissions

Approved permission concepts include:
- `products.central-catalog.view`
- `products.central-catalog.use`
- `products.central-catalog.manage`

`products.central-catalog.manage` is for appropriately authorized global/platform administration of central ingestion/governance, not ordinary branch users.

Permission enforcement must use existing Core scope semantics/public registration contracts; no Core-specific Products exception is permitted.

### 10.9 Central Audit

Auditable central actions include at least:
- central dataset ingestion started/completed/resumed.
- source/provenance definition changed.
- central record created/updated/superseded/retired/quarantined.
- barcode/regulatory conflict quarantined/resolved.
- company adopted/linked a central reference.
- company applied selected reference updates.
- company detached/relinked a reference when such action is allowed.

Audit must preserve actor/scope, dataset/import-session, entity identifiers, before/after or change summary, counts and correlation/request identifiers as appropriate.

## 11. Product Screens

### 11.1 Company Product Catalog List

Desktop should provide practical configurable columns including as applicable:
- product code.
- primary name.
- Arabic/English/trade name.
- product type.
- primary barcode.
- category.
- manufacturer.
- base/default unit.
- drug strength/dosage form summary.
- reference catalog price.
- central-reference/link indicator when applicable.
- operational status.
- last updated timestamp.
- direct view/edit actions according to permission.

### 11.2 Add Product

Logical sections:
- Basic Data.
- Classification.
- Drug Profile for DRUG only.
- Units & Packaging.
- Barcodes.
- Reference Catalog Data.
- Central Reference link/adoption information when applicable.
- Image.
- Notes.

Actions:
- Save Draft.
- Save and Activate when validation permits.
- Save and Add Another.
- Cancel.

### 11.3 Edit Product

Same logical sections, with optimistic concurrency and explicit conflict handling.

### 11.4 Product Profile / View

Show Products-owned data only:
- identity/names.
- classification.
- manufacturer.
- medicine profile/ingredients.
- units/packaging.
- barcodes.
- reference data.
- central catalog provenance/link and comparison status when linked.
- image.
- lifecycle/market status.
- audit/history access.

Future Stock, Batches, Purchases, Sales, Profit, Price History, Supplier Deals and Branch Availability tabs may appear only after their owning modules/integrations exist. No fake or placeholder transactional tabs.

### 11.5 Reference Master Management

Functional management views as applicable for:
- Categories.
- Tags.
- Manufacturers/Brand Owners.
- Ingredients.
- Dosage Forms.
- Routes.

### 11.6 Company Import Center

Real company catalog import workflow with upload, mapping, preview, validation, conflict review, execution and result report.

### 11.7 Central Egyptian Drug Catalog Browser

Functional browser/search view for authorized users with:
- barcode/name/ingredient/manufacturer search.
- package/strength/dosage display.
- source/provenance indication.
- company-match/already-adopted indication.
- adopt/link action when authorized.
- no stock or transactional claims.

### 11.8 Central Catalog Administration

For authorized global management only:
- source definition/provenance capture.
- upload/import mapping.
- preview/validation.
- conflict/quarantine review.
- ingestion result/history.
- dataset versions/import sessions.

No dead buttons or documentation-only functions count as complete.

## 12. Search

Company search-as-you-type must support as applicable:
- exact barcode with highest priority.
- product code.
- primary/display name.
- Arabic name.
- English name.
- trade/brand name.
- active ingredient.
- manufacturer.
- regulatory/EDA registration number.
- category/tag.

Requirements:
- exact scanner lookup optimized for speed.
- server-side search/pagination for large catalogs.
- normalized Arabic/English search behavior.
- no cross-company data leakage.

## 13. Filters and Sorting

Company catalog filters:
- operational status.
- product type.
- category/subcategory.
- manufacturer.
- tags.
- ingredient.
- dosage form.
- prescription classification.
- controlled/restricted flag.
- medicine market status.
- has/no barcode.
- has/no image.
- linked/unlinked to central reference.
- creation/update date range.

Sorting may include:
- name.
- product code.
- recently updated.
- recently created.
- manufacturer/category where useful.

Server-side pagination/filter/search is required for large catalogs.

## 14. Duplicate Detection

### 14.1 Company Hard Duplicate Prevention

Strong company-scoped identifiers must be protected with database constraints where applicable:
- `productCode`.
- active/valid normalized barcode ownership.
- official/regulatory registration identifier when its semantics are truly unique at that scope.
- adoption/link rule preventing unintended duplicate company adoption of the same central reference where appropriate.

### 14.2 Company Soft Duplicate Warning

Before create/import/adoption, surface probable duplicates using combinations such as:
- normalized name + manufacturer.
- trade name + strength + dosage form.
- Arabic/English name similarity.
- same active ingredients + strength + manufacturer.

Name similarity alone is not a hard block.

### 14.3 Central Duplicate/Conflict Handling

Central ingestion must prevent trusted ambiguous ownership of strong identifiers/barcodes.

If incoming source data conflicts and the correct canonical ownership cannot be proven automatically, the row/identifier must be rejected or quarantined for review instead of overwriting silently.

### 14.4 Concurrency

Duplicate protection must remain correct under simultaneous requests/import workers. UI pre-checks alone are insufficient.

## 15. Validation

Minimum company rules:
- product type required.
- primary/display name required.
- company scope comes from authenticated context.
- exactly one active base unit before ACTIVE status.
- active non-base units require valid positive conversion factors.
- every active barcode references an owned valid product unit.
- normalized active company barcode ownership is unique.
- DRUG-only fields must not produce invalid NON_DRUG state.
- regulatory identifier validated when configured.
- reference price cannot be negative.
- status transitions explicit.
- cross-company access forbidden.
- archive/update behavior explicit.

Minimum central rules:
- provenance/source identity required for trusted ingestion.
- source/import-session identity required.
- prices must not be negative.
- barcodes preserve significant leading zeroes and validate according to known symbology when declared.
- unresolved strong conflicts cannot become normal active trusted records.
- company users cannot mutate central records unless they hold central-management authorization.

## 16. Company Actions

Products v1 includes:
- create product.
- save draft.
- activate product.
- view product.
- edit product.
- change lifecycle status.
- add/edit/deactivate units.
- set base/default units according to domain rules.
- add/edit/deactivate barcodes.
- set primary barcode.
- manage categories/tags.
- manage manufacturers/ingredients/dosage forms/routes.
- duplicate pre-check.
- bulk update safe master fields.
- import company catalog.
- export company catalog.
- view product audit history.
- copy product code/barcode.
- browse central Egyptian drug catalog.
- adopt/link central medicine into company catalog.
- compare/apply selected central reference updates when linked.

No stock adjustment, receiving, sale, purchase, promotion or batch action is part of Products v1.

## 17. Bulk Update

Safe company master-data bulk update is included for fields such as:
- category.
- tags.
- manufacturer/classification.
- status where transition is valid.
- explicitly selected drug metadata.

Bulk update must:
- preview affected product count.
- require explicit field selection.
- never treat blank spreadsheet cells as silent erase unless erase is explicitly selected.
- be permission guarded.
- be audited.
- be retry-safe.
- use tested transaction/chunk semantics and report failures clearly.

Transactional prices, quantities, batches and accounting values are excluded.

## 18. Company Import / Export

### 18.1 Import Formats

Products v1 requires practical support for:
- CSV.
- XLSX.

### 18.2 Import Workflow

- upload.
- header/encoding detection where practical.
- explicit column mapping.
- preview representative rows.
- normalize names/barcodes/codes.
- validate rows.
- detect hard conflicts and soft duplicates.
- show accepted/rejected/warning counts before execution.
- execute with resumable/idempotent import-session semantics.
- produce final accepted/updated/rejected report with row-level reasons.

### 18.3 Import Modes

Explicit modes only:
- Create new only.
- Create or update by product code.
- Create or update by exact barcode when safe.

No silent fuzzy-match overwrite.

### 18.4 Import Atomicity and Scale

Products v1 must support practical large-catalog imports, including a target on the order of 25,000+ product rows.

Whole-file single-transaction rollback is not required when it would be unsafe/unscalable. Instead:
- each logical product row plus owned units/barcodes/ingredients/tags is atomic.
- processing may use tested chunks.
- each accepted row is all-success or full-rollback.
- import sessions are resumable/idempotent after retry/network interruption.
- exact committed/rejected rows are reported; partial completion is never silent.

### 18.5 Export

Export must:
- respect authorized company scope.
- respect current filters when requested.
- enforce `products.export`.
- include Products-owned data only.
- support CSV and practical XLSX output if fully implemented/tested.

## 19. Permissions

Approved Products v1 permission namespace includes at least:
- `products.view`
- `products.create`
- `products.update`
- `products.change-status`
- `products.manage-units`
- `products.manage-barcodes`
- `products.manage-classification`
- `products.bulk-update`
- `products.import`
- `products.export`
- `products.view-audit`
- `products.central-catalog.view`
- `products.central-catalog.use`
- `products.central-catalog.manage`

Permission keys must remain lowercase, dot-separated and hyphenated where needed. No underscores.

Permission registration uses the public Business Permission Registration Contract only.

## 20. Audit

Auditable company actions include at least:
- product created.
- product activated/status changed/archived.
- product identity/name changed.
- drug/regulatory profile changed.
- ingredient composition changed.
- category/tag/manufacturer changed.
- unit created/changed/deactivated.
- base/default unit changed.
- barcode created/changed/deactivated/primary changed.
- reference/public catalog price changed.
- image reference changed.
- bulk update executed.
- company import executed/resumed/completed.
- central reference adopted/linked/detached/relinked where allowed.
- selected central reference changes applied to company product.

Central audit requirements are defined in section 10.9.

Audit must use approved platform contracts/events and include actor, company/branch context when applicable, entity, before/after or change summary, metadata and request/correlation identifier.

## 21. Idempotency, Transactions and Concurrency

Protect at least:
- create product double-click/retry.
- duplicate create requests.
- barcode creation under concurrent requests.
- company product + initial units + barcodes + ingredients + tags as one atomic logical create.
- base-unit changes.
- primary-barcode changes.
- central adoption/link double-submit.
- selected central-update application.
- bulk update requests.
- company import sessions/row commits.
- central ingestion sessions/row commits.

Use database constraints, transactions, idempotency keys and optimistic concurrency/versioning as appropriate.

Critical multi-write rule:

`ALL SUCCESS -> COMMIT`

`ANY FAILURE -> FULL ROLLBACK`

No partial product/unit/barcode/ingredient state for one logical operation.

## 22. Desktop / Tablet / Mobile UX

### Desktop
- dense but readable product grid for large catalogs.
- sticky search/filter/action area.
- barcode-focused fast workflow.
- practical configurable/resizable columns where existing UI standards permit.
- multi-column product forms to avoid excessive vertical pages.
- central catalog browser optimized for rapid search/adoption.

### Tablet
- reduced visible columns.
- compact filter drawer/sheet.
- units/barcodes remain usable without horizontal-page failure.
- central search/adoption remains fully functional.

### Mobile
- card/list view instead of compressed wide tables.
- persistent fast search/scanner-friendly field.
- cards prioritize product name, barcode/code, pack/unit, manufacturer/type and status.
- Add/Edit uses clear sections and accessible Save action.
- central search/adoption works on mobile.
- import result/history may be mobile-friendly even when large spreadsheet editing is better suited to larger screens.

No supported breakpoint may expose dead actions, hidden required fields or fake content.

## 23. Edge Cases

Must explicitly handle/test as applicable:
- same product name with different strengths.
- same trade name from different manufacturers.
- combination medicines with multiple active ingredients.
- product with no barcode.
- product with multiple pack barcodes.
- barcode reassignment attempt.
- leading zeroes in barcode/product codes.
- Arabic/English normalization.
- scanner Enter/Tab terminator.
- duplicate rows in one import file.
- import retry after network interruption.
- changing unit conversion while another user edits the product.
- inactive/archived product resolution by future consumers.
- discontinued medicine that may still have future inventory stock.
- large catalog pagination/search.
- missing/stale reference price.
- central record already adopted by the company.
- company local override differs from updated central value.
- central source record is superseded/retired after company adoption.
- two central source rows claim the same active barcode.
- central dataset retry/resume after partial chunk completion.
- company attempts central-management action without global authorization.

## 24. Explicitly Outside Products Ownership

Products must not own or persist:
- branch stock quantity -> Inventory.
- batches/lots -> Inventory.
- expiry dates/near-expiry state -> Inventory.
- FEFO allocation -> Inventory/Sales integration.
- opening stock -> Inventory/Accounting integration.
- stock adjustments/transfers -> Inventory.
- supplier relationship/preferred supplier -> Purchases/Suppliers integration.
- purchase orders/invoices/returns -> Purchases.
- actual last/average purchase cost -> Purchases/Inventory Costing.
- sales invoices/returns -> Sales.
- POS basket/checkout -> Sales/POS.
- actual company/branch selling prices/price lists -> Pricing.
- discounts/promotions/coupons -> Pricing/Sales.
- realized profit/margin -> Sales/Accounting/Reporting.
- cash/treasury movements -> Cash/Accounting.
- GL/tax calculation -> Accounting/Tax.
- reorder point/min-max stock by branch -> Inventory/Replenishment.
- recalls/regulatory-alert operational workflows -> future Regulatory/Safety ownership/integration.

The Central Egyptian Drug Reference Catalog is reference/master data only and does not change these ownership boundaries.

## 25. Future Integration Contracts

Products must expose only minimum stable public contracts needed by consuming modules, conceptually including:
- company product summary resolver by company + product id.
- exact company barcode resolver.
- product operational availability check.
- unit/package conversion summary.
- safe medicine summary.
- central reference summary/resolution suitable for company adoption workflows.

Design concepts may include equivalents of:
- `PRODUCT_READER`.
- `ProductSummary`.
- `ProductUnitSummary`.
- `BarcodeResolution`.
- `getProductSummary(companyId, productId)`.
- `resolveBarcode(companyId, barcode)`.
- `isProductAvailable(companyId, productId)`.

Public events may include product created/updated/status-changed, unit/barcode changed, central reference adopted and other minimal events required for downstream cache/integration invalidation.

Exact TypeScript signatures are BUILD-stage details and must not leak Prisma or internal persistence types.

## 26. Error Handling

Expected typed scenarios include:
- validation failure.
- authentication/permission denied.
- product not found.
- central reference not found/unavailable.
- duplicate product code.
- duplicate barcode.
- duplicate regulatory identifier.
- duplicate/invalid central adoption.
- invalid base-unit state.
- invalid conversion factor.
- invalid barcode format/type.
- invalid lifecycle transition.
- concurrent update conflict.
- import row conflict/rejection.
- import session retry conflict.
- central ingestion source/provenance validation failure.
- central strong-identifier/barcode quarantine conflict.
- cross-company access attempt.
- unauthorized central-management attempt.

All API failures must use the approved typed `AppError` / `UnifiedErrorFilter` pattern.

## 27. Security and Isolation

Products BUILD verification must demonstrate:
- authentication required where appropriate.
- authorization enforced server-side.
- company scope derived from authenticated context.
- no cross-company read/write/update/adoption/import/export leakage.
- branch-scoped permissions respected where Core scope semantics apply.
- central management cannot be gained through arbitrary client scope parameters.
- central reference browsing does not expose unrelated sensitive platform-admin data.
- audit metadata does not leak forbidden cross-company data.

## 28. Verification Requirements for BUILD Stage

Every requirement in this specification must have explicit verification evidence.

Minimum Products v1 gates:
- `pnpm install --frozen-lockfile`.
- lockfile consistency/frozen reinstall as repository workflow requires.
- Prisma generate.
- empty PostgreSQL migration.
- database migration/status.
- lint with zero warnings.
- strict typecheck.
- unit tests.
- architecture tests.
- Products module integration tests.
- full integration regression as applicable.
- API tests.
- permission registration tests.
- permission scope tests.
- authentication regression.
- company isolation tests.
- branch isolation tests where applicable.
- validation tests.
- duplicate product/barcode tests.
- concurrent duplicate tests.
- idempotency/double-submit tests.
- optimistic-concurrency tests.
- transaction rollback tests for product + units/barcodes/ingredients/tags.
- exact barcode resolution/scanner-flow tests.
- large-catalog pagination/search tests.
- company import mapping/validation/duplicate/retry/resume/row-atomicity tests.
- company export permission/scope tests.
- bulk-update preview/permission/retry/audit tests.
- central catalog provenance/source validation tests.
- central catalog ingestion mapping/validation/conflict/quarantine/retry/resume tests.
- central catalog search tests.
- central adoption/link duplicate/idempotency/company-isolation tests.
- central update compare/apply tests ensuring company overrides are not silently overwritten.
- central-management authorization tests.
- audit tests.
- responsive Desktop/Tablet/Mobile verification.
- production API build.
- production Web build.

A build alone is never sufficient evidence.

If a verified Egyptian reference dataset is not available during BUILD, Central Catalog **population** must be reported separately as `NOT VERIFIED`/`BLOCKED`; this does not authorize fake seed data. Capability implementation still requires all applicable functional tests using clearly marked test fixtures.

## 29. Owner UI/UAT Gate

After successful automated verification, status is only:

`READY FOR OWNER UI/UAT REVIEW`

It is not `APPROVED MODULE` until Owner review/waiver plus Final Verification is recorded according to project lifecycle rules.

## 30. Railway

No Railway deploy/redeploy/restart/service/database/settings operation is authorized by this specification.

Railway action requires the Owner's explicit command:

`DEPLOY TO RAILWAY`

## 31. Change Control

This is the frozen Products v1 Source of Truth.

After this approval:
- no requirement may be silently removed.
- no new Product requirement may be silently added.
- any Product scope change requires `PRODUCTS MODULE CHANGE REQUEST`.
- any genuine reusable Core defect requires a separate `CORE CHANGE REQUEST`.
- no Core workaround/patch is permitted to bypass architecture or verification gates.
- no other Business Module may be started in this chat while Products is the active module.

## 32. Approved v1 Scope Summary

Products v1 is approved for:
- company product master catalog.
- DRUG / NON_DRUG types.
- multilingual/trade product identity.
- categories/tags/manufacturers.
- ingredients/dosage forms/routes and medicine profile.
- multi-level units and packaging conversions.
- multiple package barcodes with exact scanner lookup.
- DRAFT / ACTIVE / INACTIVE / ARCHIVED lifecycle.
- duplicate detection and strong identifier constraints.
- search/filter/sort/server-side pagination.
- company CSV/XLSX import with mapping, preview, row-level validation and retry-safe chunked atomicity suitable for large catalogs.
- company export.
- safe master-data bulk update.
- permissions/audit/idempotency/optimistic concurrency.
- responsive Desktop/Tablet/Mobile UX.
- public product/barcode/unit resolution contracts for future modules.
- **Central Egyptian Drug Reference Catalog** inside Products ownership.
- central source/provenance governance.
- central large-dataset ingestion with conflict quarantine and dataset/import-session traceability.
- central search by barcode/name/ingredient/manufacturer/regulatory data.
- company adoption/linking from central reference.
- company overrides that never mutate or get silently overwritten by central reference.
- explicit compare/apply of later central reference changes.
- central catalog platform/global management permission boundaries and audit.

Inventory, Batches, Expiry/FEFO, Purchases, Sales/POS, actual Pricing, Accounting, Cash/Treasury and transactional Reporting remain the responsibility of their proper owning modules.

---

SPECIFICATION STATUS: **APPROVED**

NEXT ALLOWED STAGE: **BUILD**

NO PRODUCTS SOURCE CODE IMPLEMENTATION IS INCLUDED IN THIS SPECIFICATION COMMIT.
