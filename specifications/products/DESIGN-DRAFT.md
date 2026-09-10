# Elhafez Platform — Products / Drug Catalog — DESIGN DRAFT

Status: DISCOVER + DESIGN — AWAITING OWNER APPROVAL
Module: products
Proposed Version: 1.0
Platform Baseline: 2a8dbaa7e8ab665e0e8c59cd7fa92810ef80ec82
Core Baseline: bd0c3e7faa09a297c55fe19bf395393a67a3cf15
Branch: module/products

> This document is a design draft only. It is NOT an approved specification and contains no source-code authorization.

## 1. Purpose

The Products module owns the company-scoped product and medicine master catalog used by future Inventory, Purchases, Sales/POS, Pricing and Reporting modules.

It is responsible for stable product identity, product/drug descriptive data, classifications, ingredients, dosage metadata, manufacturers/brands, units and pack conversions, barcodes, lifecycle status, product images/references, reference catalog metadata, search, duplicate detection, import/export, permissions and audit.

It must not own stock quantities, batches/lots, expiry inventory, FEFO allocation, purchase transactions, sale transactions, customer/supplier balances, accounting entries, actual branch selling-price rules, discounts/promotions, or transactional profitability.

## 2. Product Scope Model

Products v1 should support both pharmacy medicines and non-drug items without forcing all Elhafez Platform products to be medicines.

Recommended top-level type:
- `DRUG`
- `NON_DRUG`

Configurable categories/tags provide more detailed classification such as cosmetics, medical supplies, supplements, devices, general retail, etc.

For `DRUG`, the medicine profile may contain regulatory/pharmaceutical metadata. For `NON_DRUG`, those fields remain absent and are not shown as required UI.

## 3. Product Entity — Core Data

### 3.1 Identity
- immutable internal `id`.
- authorized `companyId` scope.
- system-generated human-readable `productCode`, unique within company.
- `productType`: `DRUG` or `NON_DRUG`.
- required primary/display name.
- optional Arabic name.
- optional English name.
- optional brand/trade name where distinct from display name.
- optional description.
- optional internal notes.

### 3.2 Classification
- hierarchical/configurable product category.
- zero or more product tags.
- optional manufacturer/brand-owner reference owned by Products master data.
- optional country of origin.

### 3.3 Product Image
- optional file/image reference through the approved Files public contract/integration.
- Products may store only the allowed scalar file reference and must never access Files internal persistence directly.

## 4. Drug / Medicine Profile

For `DRUG` products, support as applicable:
- one or more active ingredients, including combination medicines.
- strength/value and strength unit per ingredient where applicable.
- dosage form such as tablet, capsule, syrup, cream, ampoule, vial, drops, inhaler, etc.
- route of administration when useful.
- optional EDA/official registration number or other regulatory catalog identifier.
- optional ATC/code or equivalent reference classification.
- prescription classification such as OTC / prescription-required / controlled where configured.
- controlled/restricted medicine flag where applicable.
- optional cold-chain/storage-condition flag and storage notes/temperature guidance.
- optional market availability metadata such as available/discontinued/unknown, separate from the module operational status.
- optional reference/public catalog price and last-verified/source metadata.

The reference/public catalog price is informational master-catalog data only. Actual company/branch selling prices, price lists, discounts, promotions and pricing history belong to a future Pricing/Sales capability.

## 5. Ingredients and Pharmaceutical Reference Data

Products owns only the medicine reference data required to describe products inside this domain:
- ingredient master records.
- dosage-form master records.
- optional route-of-administration master records.
- manufacturer/brand-owner master records.

These lists must be configurable and searchable and must not contain supplier purchasing relationships or transactional data.

## 6. Units and Packaging

A product must support one or more units/package levels.

Each product unit may include:
- unit id.
- display name and short label.
- conversion factor to the base unit.
- base-unit flag.
- default-sale-unit suggestion.
- default-purchase-unit suggestion.
- active flag.
- optimistic version.

Rules:
- exactly one active base unit per product.
- base conversion factor is always 1.
- other conversion factors must be positive and valid.
- multiple pack levels are supported, e.g. tablet -> strip -> box.
- unit/pack conversion is intrinsic product master data; future transactional modules should snapshot the conversion used by each transaction so historical records are not rewritten by later catalog changes.
- default sale/purchase unit is only a product-master suggestion; consuming modules remain owners of their transaction behavior.

## 7. Barcodes

Products owns product/unit barcodes.

Each barcode may include:
- barcode value.
- barcode type/symbology when known: EAN-13, EAN-8, UPC-A, UPC-E, GTIN-14, internal/custom, or equivalent supported type.
- associated product unit/package.
- primary-barcode flag.
- active flag.
- optional source/reference metadata.

Rules:
- barcode values are normalized and unique within the company where active/valid.
- one product may have multiple barcodes.
- one unit/package may have multiple historical/alternate barcodes.
- exact barcode lookup must be optimized for scanner/POS usage.
- a normal retail barcode identifies the product/package, not the inventory batch.
- batch/lot number and expiry belong to Inventory. Future GS1/DataMatrix parsing may resolve the product GTIN through Products and pass batch/expiry components to Inventory without Products owning the batch.

## 8. Lifecycle Status

Recommended operational statuses:
- `DRAFT`
- `ACTIVE`
- `INACTIVE`
- `ARCHIVED`

Rules:
- DRAFT products are incomplete or not yet approved for normal downstream use.
- ACTIVE products are available to future consuming modules.
- INACTIVE products remain readable but are unavailable for new normal downstream transactions unless a consuming module has an explicitly approved exception.
- ARCHIVED products are hidden from default lists but remain searchable/viewable with permission.
- no normal hard-delete action in Products v1.

For medicines, a separate market-status field may represent AVAILABLE / DISCONTINUED / UNKNOWN without abusing the operational lifecycle status.

## 9. Screens

### 9.1 Product Catalog List
Desktop list should include configurable practical columns such as:
- product code.
- primary name.
- Arabic/English or trade name when useful.
- product type.
- primary barcode.
- category.
- manufacturer.
- base/default unit.
- drug strength/dosage form summary when applicable.
- reference catalog price when allowed.
- operational status.
- last updated timestamp.
- direct open/edit actions according to permission.

### 9.2 Add Product
Logical sections:
- Basic Data.
- Classification.
- Drug Profile (only for DRUG).
- Units & Packaging.
- Barcodes.
- Reference Catalog Data.
- Image.
- Notes.

Actions:
- Save Draft.
- Save and Activate when validation permits.
- Save and Add Another.
- Cancel.

### 9.3 Edit Product
Same logical sections with optimistic-concurrency protection and clear conflict handling.

### 9.4 Product Profile / View
Show Products-owned data only:
- identity and names.
- classification.
- manufacturer.
- medicine profile/ingredients.
- units and packaging.
- barcodes.
- reference catalog metadata.
- image.
- lifecycle/market status.
- audit/history access.

Future Stock, Batches, Purchases, Sales, Profit, Price History, Supplier Deals and Branch Availability tabs may appear only after their owning modules/integrations exist. No fake/placeholder transactional tabs.

### 9.5 Catalog Reference Management
Products v1 may include functional management views for:
- Categories.
- Tags.
- Manufacturers/Brand Owners.
- Ingredients.
- Dosage Forms.
- Routes when enabled.

### 9.6 Import Center
A real import workflow with upload, mapping, preview, validation, conflict review, execution and result report.

## 10. Search

Fast search-as-you-type must support, as applicable:
- exact barcode with highest priority.
- product code/SKU.
- primary/display name.
- Arabic name.
- English name.
- trade/brand name.
- active ingredient.
- manufacturer.
- regulatory/EDA registration number.
- category/tag.

Barcode scanner behavior:
- exact barcode should resolve immediately without requiring Enter-button navigation when the scanner submits its terminator.
- public resolver contract should be suitable for future POS/Purchases/Inventory consumers.
- when multiple records would conflict, the data rule must prevent ambiguous active barcode ownership rather than asking POS to guess.

## 11. Filters and Sorting

Filters:
- operational status.
- product type.
- category and subcategory.
- manufacturer.
- tags.
- ingredient.
- dosage form.
- prescription classification.
- controlled/restricted flag.
- market status.
- has/no barcode.
- has/no image.
- creation/update date range.

Sorting:
- name.
- product code.
- recently updated.
- recently created.
- manufacturer/category as useful.

Server-side pagination/filter/search is required for large catalogs.

## 12. Duplicate Detection

### Hard duplicate prevention
Strong identifiers should be protected by database constraints scoped to company where supplied:
- `productCode`.
- barcode value.
- official/regulatory registration number when it is a truly unique product identifier.

### Soft duplicate warning
Before create/import, surface probable duplicates based on combinations such as:
- normalized name + manufacturer.
- trade name + strength + dosage form.
- Arabic/English normalized name similarity.
- same active ingredients + strength + manufacturer.

Name similarity alone must not be a hard block.

Concurrency must remain safe under two simultaneous creates/imports; UI pre-checks are not sufficient.

## 13. Validation

Minimum rules:
- product type required.
- primary/display name required.
- company scope from authenticated context, never arbitrary trusted client `companyId`.
- exactly one active base unit before ACTIVE status.
- every active non-base unit has a valid positive conversion factor.
- every barcode references a valid owned product unit and is normalized.
- company-scoped barcode uniqueness.
- DRUG-only fields rejected or normalized appropriately for NON_DRUG products where necessary.
- regulatory identifier format validation when configured.
- reference price cannot be negative.
- status transitions explicit and validated.
- cross-company access forbidden.
- archive/update rules explicit.

## 14. Actions

Products v1 proposed actions:
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
- import catalog.
- export catalog.
- view audit history.
- copy product code/barcode.

No stock-adjustment, receiving, sale, purchase, price-promotion or batch actions are part of Products v1.

## 15. Bulk Update

Commercially useful bulk update is included for safe master-data fields such as:
- category.
- tags.
- manufacturer/classification.
- status where valid.
- drug metadata where explicitly selected and validated.

Bulk update must:
- show the number of affected products before commit.
- require explicit field selection; blank import cells must not silently erase data.
- be permission guarded.
- be audited with summary metadata.
- be retry-safe.
- use transaction semantics appropriate to the selected batch size and report failures clearly.

Actual transactional prices, quantities, batches and accounting values are excluded.

## 16. Import / Export

Import is a first-class requirement because pharmacy catalogs can contain tens of thousands of items.

### 16.1 Import formats
Recommended v1 target:
- CSV.
- XLSX spreadsheet.

### 16.2 Import workflow
- upload.
- detect headers/encoding where practical.
- explicit column mapping.
- preview representative rows.
- normalize names/barcodes/codes.
- validate each row.
- detect hard conflicts and soft duplicates.
- show accepted/rejected/warning counts before execution.
- execute with resumable/idempotent import-session semantics.
- produce final accepted/updated/rejected report with row-level reasons.

### 16.3 Import modes
Explicit modes only:
- Create new only.
- Create or update by product code.
- Create or update by exact barcode when safe.

No silent fuzzy-match overwrite.

### 16.4 Atomicity strategy
For large catalogs, whole-file rollback is not required if it would make practical 25k+ row imports unsafe or unscalable. Instead:
- every product row and all its owned child data (units/barcodes/ingredients/tags) is atomic.
- processing may occur in tested chunks.
- each accepted row is all-success or full-rollback.
- the batch is resumable and idempotent after network retry.
- partial completion is never silent; exact committed/rejected rows are reported.

### 16.5 Export
Export must respect:
- authorized company scope.
- current filters when requested.
- permission checks.
- practical CSV and XLSX-friendly output if fully implemented/tested.
- product-owned data only.

## 17. Permissions

Proposed permission namespace:
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

Permission keys must be registered through the public Business Permission Registration Contract and must not be added to Core.

Products are company-scoped master data. Branch-specific stock, availability and price behavior remain outside this module.

## 18. Audit

Auditable actions include at least:
- product created.
- product activated/status changed/archived.
- product core identity/name changed.
- drug/regulatory profile changed.
- ingredient composition changed.
- category/tag/manufacturer changed.
- unit created/changed/deactivated.
- base/default unit changed.
- barcode created/changed/deactivated/primary changed.
- reference/public catalog price changed.
- image reference changed.
- bulk update executed.
- import executed/resumed/completed, with accepted/updated/rejected counts.

Audit uses the approved platform audit event/contract and includes actor, company, branch context where available, entity, before/after state, metadata and correlation/request identifier.

## 19. Idempotency, Transactions and Concurrency

Protect at least:
- create product double-click/retry.
- duplicate create requests.
- barcode creation under concurrent requests.
- product + initial units + barcodes + ingredients + tags as one atomic create operation.
- base-unit changes.
- primary-barcode changes.
- bulk update requests.
- import sessions and row commits.

Use database constraints, transactions, idempotency keys and optimistic concurrency/versioning as appropriate.

Critical multi-write operation rule:
ALL SUCCESS -> COMMIT
ANY FAILURE -> FULL ROLLBACK

No partial product/unit/barcode/ingredient state for one logical product operation.

## 20. Desktop / Tablet / Mobile UX

### Desktop
- dense but readable product grid suitable for large catalogs.
- sticky search/filter/action area.
- barcode-focused fast workflow.
- resizable or configurable practical columns where existing UI standards allow it.
- product form uses multi-column sections to avoid very long pages.

### Tablet
- reduced visible columns.
- filters in compact drawer/sheet.
- units/barcodes remain editable without horizontal-page failure.

### Mobile
- card/list view instead of compressed wide table.
- persistent fast search and scanner-friendly field.
- cards prioritize product name, barcode/code, pack/unit, manufacturer/type and status.
- Add/Edit uses clear collapsible sections and sticky Save action where practical.
- import may be view/report capable on mobile, while large spreadsheet selection remains supported if device/browser permits.

No breakpoint may expose dead actions or hidden required fields.

## 21. Edge Cases

Must explicitly handle/test:
- same product name with different strengths.
- same trade name from different manufacturers.
- combination medicines with multiple active ingredients.
- product with no barcode.
- product with multiple pack barcodes.
- barcode reassignment attempt.
- leading zeros in barcode/product codes.
- Arabic/English name normalization.
- scanner sends Enter/Tab terminator.
- duplicate import rows inside the same file.
- retry after import network interruption.
- changing unit conversion while another user edits the product.
- inactive/archived product selected by a future consuming module.
- discontinued medicine that still has future inventory stock.
- large catalog search/pagination.
- reference price missing or stale.

## 22. Explicitly Outside Products Ownership

Not owned or persisted by Products:
- branch stock quantity -> Inventory.
- batches/lots -> Inventory.
- expiry dates and near-expiry state -> Inventory.
- FEFO allocation -> Inventory/Sales integration.
- opening stock -> Inventory/Accounting integration.
- stock adjustments/transfers -> Inventory.
- supplier relationship and preferred supplier -> Purchases/Suppliers integration.
- purchase orders/invoices/returns -> Purchases.
- last/average purchase cost -> Purchases/Inventory costing.
- sales invoices/returns -> Sales.
- POS basket/checkout -> Sales/POS.
- actual branch selling prices/price lists -> Pricing.
- discounts/promotions/coupons -> Pricing/Sales.
- profit/margin realization -> Sales/Accounting/Reporting.
- cash/treasury movements -> Cash/Accounting.
- GL/tax calculation -> Accounting/Tax.
- reorder point/min-max stock by branch -> Inventory/Replenishment.
- recalls/regulatory alerts and safety workflows -> future Regulatory/Safety integration.

## 23. Future Integration Contracts — Design Intent

Products should expose a minimum stable public surface suitable for future modules, conceptually including:
- product summary resolver by company + product ID.
- exact barcode resolver by company + barcode.
- product operational availability check.
- unit/package conversion summary.
- safe medicine summary when needed.

Design intent may include concepts equivalent to:
- `PRODUCT_READER`.
- `ProductSummary`.
- `ProductUnitSummary`.
- `BarcodeResolution`.
- `getProductSummary(companyId, productId)`.
- `resolveBarcode(companyId, barcode)`.
- `isProductAvailable(companyId, productId)`.

Public events may include product created/updated/status changed and unit/barcode changed events where downstream cache/integration invalidation is required.

Exact signatures are BUILD-stage details after approval and must not leak Prisma/internal persistence types.

## 24. Egypt Drug Catalog / Global Reference Data

Products v1 should be able to IMPORT and maintain a company catalog containing Egyptian medicines, barcodes and reference/public prices.

A centrally synchronized, platform-global Egyptian drug database with external-source ingestion, licensing/provenance, scheduled updates and automatic company synchronization is NOT silently assumed as part of Products v1 because it introduces separate data-source, provenance and update-governance concerns.

If the Owner wants this in v1, it should be explicitly approved as part of this Products specification with a defined trusted data source and synchronization policy. Otherwise it remains a future Products change/integration capability.

## 25. Error Handling

Expected typed scenarios include:
- validation failure.
- forbidden/permission denied.
- product not found.
- duplicate product code.
- duplicate barcode.
- duplicate regulatory identifier.
- invalid base-unit state.
- invalid conversion factor.
- invalid barcode format/type.
- invalid lifecycle transition.
- concurrent update conflict.
- import row conflict/rejection.
- import session retry conflict.
- cross-company access attempt.

All API failures use the approved typed `AppError` / `UnifiedErrorFilter` pattern.

## 26. Verification Requirements for BUILD Stage

Every approved requirement must have verification evidence.

Minimum Products gates:
- frozen install / lockfile consistency.
- Prisma generate.
- empty PostgreSQL migration.
- database migration/status.
- lint zero warnings.
- strict typecheck.
- unit tests.
- architecture tests.
- Products integration tests.
- API tests.
- permission registration/scope tests.
- authentication regression.
- company isolation tests.
- validation tests.
- duplicate product/barcode tests.
- concurrent duplicate tests.
- idempotency/double-submit tests.
- optimistic concurrency tests.
- transaction rollback tests for product + units/barcodes/ingredients.
- exact barcode resolution/search tests.
- large-catalog pagination/search tests.
- import mapping/validation/duplicate/retry/resume/row-atomicity tests.
- export permission/scope tests.
- audit tests.
- responsive Desktop/Tablet/Mobile verification.
- production API build.
- production Web build.

## 27. Approval Gate

This design is awaiting Owner approval.

Before `APPROVED`:
- no Products source code.
- no Prisma Products schema/migration.
- no composition wiring.
- no Core change.

After Owner says `APPROVED`, create `specifications/products/APPROVED-SPECIFICATION.md` in an independent specification commit, freeze v1 scope, then proceed to BUILD only according to that approved document.
