# Elhafez Platform — Suppliers Module Approved Specification

Status: APPROVED SPECIFICATION
Module: suppliers
Version: 1.0
Platform Baseline: 027a00f61087738038211286ecf9f30ce1bf52a0
Core Baseline: bd0c3e7faa09a297c55fe19bf395393a67a3cf15
Approved by Owner: Yes

## 1. Purpose

The Suppliers module owns the supplier master record for a company. It is responsible for supplier identity, contact information, contact persons, addresses, classification, lifecycle status, duplicate detection, permissions, audit integration, import and export.

It must not become the owner of purchases, supplier invoices, purchase returns, accounting balances, payments, cash/treasury movements, general-ledger entries, inventory receipts, supplier statements, or transactional purchase history.

## 2. Architecture and Ownership Rules

- Implementation must live under `modules/suppliers/` and follow `MODULE-STANDARD.md` and `templates/module-template/`.
- Supplier-owned Prisma models must be declared only in `prisma/schema/modules/suppliers.prisma`.
- The module owns only supplier-domain tables.
- No direct access to another module's tables, repositories, internal services, infrastructure, or source files.
- Cross-module collaboration is allowed only through approved public contracts, application services/interfaces, or domain events.
- No circular dependencies.
- No Core changes are approved by this specification.
- If implementation reveals a genuine Core deficiency, stop and raise a separate CORE CHANGE REQUEST before modifying Core.

## 3. Supplier Entity — Required Data

### 3.1 Core Identity
- `id`: internal immutable identifier.
- `companyId`: owning company scope.
- `supplierCode`: system-generated human-readable code, unique within company.
- `supplierType`: `INDIVIDUAL` or `COMPANY`.
- `legalName`: required supplier/legal name.
- `tradeName`: optional commercial/trade name.

### 3.2 Contact Information
- `primaryPhone`: optional.
- `secondaryPhone`: optional.
- `whatsappPhone`: optional.
- `email`: optional.
- `website`: optional.
- Phone values must be normalized before persistence/comparison.

### 3.3 Legal / Identification Information
- `nationalId`: optional and mainly applicable to individual suppliers.
- `taxNumber`: optional and mainly applicable to company suppliers.
- `commercialRegistration`: optional.
- Strong identifiers must support duplicate prevention within the same company where present.

### 3.4 Classification
- `categoryId` or equivalent owned supplier category reference.
- zero or more supplier tags owned by Suppliers.

### 3.5 Notes
- general supplier notes owned by the Suppliers module.
- notes must not be used to store balances, payment state, accounting values or transactional history.

## 4. Supplier Contact Persons

The module must support multiple contact persons per supplier.

Each contact may include:
- name.
- job title/role.
- phone.
- WhatsApp phone.
- email.
- primary-contact flag.
- active flag.

Rules:
- zero or more contacts allowed.
- at most one primary contact per supplier.
- user can add, edit and deactivate a contact according to domain rules.
- changing the primary contact must be transaction-safe.
- contact-person data remains supplier master data only and must not carry purchasing/accounting state.

## 5. Supplier Addresses

The module must support multiple addresses per supplier.

Each address may include:
- label/name such as Head Office, Warehouse, Branch.
- governorate/region.
- city/area.
- street.
- extra details.
- landmark.
- optional address phone.
- default flag.
- active flag.

Rules:
- zero or more addresses allowed.
- at most one default address per supplier.
- user can add, edit and deactivate/remove an unused address according to domain rules.
- changing the default address must be transaction-safe.

## 6. Status Lifecycle

Supported statuses:
- `ACTIVE`
- `SUSPENDED`
- `ARCHIVED`

Rules:
- Active suppliers are available for normal downstream use.
- Suspended suppliers remain readable but may be blocked from new downstream transactions according to consuming-module business rules.
- Archived suppliers are hidden from default operational lists but remain searchable/viewable with proper permission.
- No normal hard-delete action is part of Suppliers v1.

## 7. Screens

### 7.1 Supplier List
Must provide:
- supplier code.
- legal/name display.
- trade name when available.
- primary phone.
- type.
- category.
- city when available.
- status.
- last update timestamp.
- direct open action.

### 7.2 Add / Edit Supplier
Logical sections:
- Basic Data.
- Contact Information.
- Contact Persons.
- Addresses.
- Classification.
- Notes.

Actions:
- Save.
- Save and Add Another.
- Cancel.

No dead buttons, placeholders or UI-only fields are allowed.

### 7.3 Supplier Profile
Must show supplier-owned data only:
- identity/basic data.
- contact information.
- contact persons.
- addresses.
- classification/tags.
- notes.
- lifecycle status.
- audit/history access.

Future tabs for Purchases, Payments, Accounting, Statements, Performance, Inventory Receipts, etc. may appear only when the owning modules and integrations exist. Suppliers must not fake or locally duplicate those datasets.

## 8. Actions

Suppliers v1 includes:
- Create supplier.
- View supplier.
- Edit supplier.
- Change status.
- Add/edit/deactivate contact person.
- Set primary contact person.
- Add/edit/deactivate address.
- Set default address.
- Copy phone number.
- Open WhatsApp using an existing saved WhatsApp/phone number.
- View audit history when authorized.
- Import suppliers.
- Export suppliers.

## 9. Search and Filters

Search must support, as applicable:
- legal name.
- trade name.
- supplier code.
- primary/secondary/WhatsApp phone.
- email.
- national ID.
- tax number.
- commercial registration.
- contact-person name/phone/email where technically appropriate.

Filters:
- status.
- supplier type.
- category.
- governorate/city.
- tags.
- creation date range.

Requirements:
- fast search-as-you-type UX.
- clear-all-filters action.
- server-side pagination/search where data volume requires it.

## 10. Duplicate Detection

### 10.1 Hard Duplicate Prevention
Strong identifiers such as `nationalId` and `taxNumber`, when present and applicable, must be protected by database constraints scoped to company.

`commercialRegistration` should also be treated as a strong identifier when supplied in a form suitable for normalized company-level uniqueness.

### 10.2 Soft Duplicate Warning
Before creating a supplier, the system should surface likely duplicates based on matching/similar:
- legal name.
- trade name.
- phone.
- WhatsApp number.
- email.

Phone duplication is not an automatic hard block because legitimate shared numbers may exist.

### 10.3 Concurrency
Duplicate protection must remain correct under concurrent requests and retries; UI checks alone are insufficient.

## 11. Validation

- `legalName` required.
- `supplierType` required.
- `companyId` must come from authorized scope, not trusted from arbitrary client input.
- email must be valid when supplied.
- website must be valid when supplied.
- phone numbers normalized when supplied.
- strong identifiers validated and constrained where applicable.
- at most one default address.
- at most one primary contact person.
- cross-company access forbidden.
- archived-state modifications must obey explicit domain/permission rules.

Phone is not mandatory in Suppliers v1.

## 12. Permissions

Suppliers v1 requires explicit permission contracts for at least:
- `suppliers.view`
- `suppliers.create`
- `suppliers.update`
- `suppliers.change-status`
- `suppliers.view-sensitive`
- `suppliers.export`
- `suppliers.import`

No supplier hard-delete permission is part of v1.

All permissions must respect the Core company/branch scope model where applicable.

## 13. Audit

Auditable actions include at least:
- supplier created.
- supplier updated.
- sensitive/strong identifier changed.
- contact information changed.
- contact person created/updated/deactivated.
- primary contact changed.
- address created/updated/deactivated.
- default address changed.
- status changed.
- classification/tags changed.
- supplier import executed, including accepted/rejected summary metadata.

Audit must use the approved platform audit contract/event mechanism and include relevant actor, company, branch, entity, before/after state, metadata and request/request-correlation identifier according to Core standards.

## 14. Retry, Idempotency and Transaction Safety

Create/update/import operations must be safe against:
- double click.
- client retry.
- network retry.
- duplicate concurrent requests.

Database constraints and transaction boundaries must protect invariants.

Multi-write operations such as supplier + initial contacts + initial addresses + tags, changing default address, changing primary contact, and atomic import batches must obey:

ALL SUCCESS -> COMMIT
ANY FAILURE -> FULL ROLLBACK

No partial supplier/contact/address/classification state is acceptable.

Optimistic concurrency/versioning must protect conflicting supplier and child-record updates where applicable.

## 15. UX / Responsive Requirements

### Desktop
- full supplier table.
- visible search and filters.
- clear primary actions.
- efficient profile/edit experience.

### Tablet
- reduced visible columns.
- important actions remain accessible.

### Mobile
- supplier-card/list presentation rather than an unusable wide compressed table.
- persistent/easy-to-access search.
- obvious Add Supplier action.
- cards should prioritize name, phone, code and status.

UI must remain fully functional at each supported breakpoint.

## 16. Supplier Categories and Tags

Suppliers v1 includes supplier classification and tags.

Examples may include Distributor, Manufacturer, Service Provider, Local Supplier, but implementation must not hard-code pharmacy-only semantics into the platform-level Suppliers module.

The module must support reusable configurable supplier categories/tags suitable across Elhafez Platform products.

## 17. Import / Export

Supplier export and import are explicitly approved for v1.

### 17.1 Export
- guarded by `suppliers.export`.
- respects company scope and current authorized filters.
- must not expose sensitive fields unless permission policy allows it.
- export format must be suitable for practical business use, with CSV as the minimum machine-readable format; additional spreadsheet-friendly output may be added only if implemented completely and tested.

### 17.2 Import
- guarded by `suppliers.import`.
- validates rows before/while processing.
- normalizes phone numbers and identifiers.
- detects strong duplicates.
- reports rejected rows clearly with row-level reasons.
- does not silently overwrite existing suppliers.
- does not bypass permissions or company scope.
- must be retry-safe/idempotent.
- must not create partial supplier/contact/address state for an accepted row.
- import strategy must define clear atomicity: either whole-batch atomic import or explicitly reported per-row atomic processing; silent partial corruption is forbidden.
- practical v1 target: up to 1000 rows per request unless implementation evidence justifies a different tested limit.

## 18. Explicitly Out of Suppliers Module Ownership

The following capabilities are NOT owned or persisted by Suppliers and must be implemented later through the proper owning module/integration:

- Purchase Orders -> Purchases.
- Purchase Invoices -> Purchases.
- Purchase Returns -> Purchases/Returns.
- Goods Receiving / stock receipt effects -> Purchases/Inventory integration.
- Opening balance -> Accounting.
- Current supplier balance -> Accounting.
- Used credit / debt balance -> Accounting/Credit integration.
- Supplier statement -> Accounting/Reporting.
- Supplier payments -> Payments/Accounting.
- Cash/Treasury movements -> Cash/Accounting.
- General Ledger entries -> Accounting.
- Payment allocation -> Payments.
- Purchase prices/history -> Purchases.
- Supplier performance based on transactions -> Reporting/Purchases.
- Inventory quantities/batches -> Inventory.
- Bank-payment execution data -> Payments/Banking.

Suppliers may expose public contracts needed by these modules, but it must not directly read or write their private tables or logic.

## 19. Future Integration Contracts — Design Intent

Suppliers should expose only the minimum stable public surface needed by other modules, such as:
- resolve supplier identity by ID within authorized company scope.
- retrieve safe public supplier summary.
- check supplier lifecycle availability for downstream use.
- public supplier-created/updated/status-changed events where needed.

Design intent includes concepts equivalent to:
- `SUPPLIER_READER`.
- `SupplierSummary`.
- `getSupplierSummary(companyId, supplierId)`.
- `isSupplierAvailable(companyId, supplierId)`.

Exact signatures are a BUILD-stage design detail and must conform to repository standards without leaking internal persistence models.

## 20. Error Handling

Expected error classes/scenarios include:
- validation failure.
- forbidden/permission denied.
- supplier not found.
- duplicate strong identifier.
- invalid status transition.
- invalid/default-address conflict.
- invalid/primary-contact conflict.
- import row rejection/conflict.
- concurrent update conflict.
- cross-company access attempt.

API failures must use the approved typed AppError/UnifiedErrorFilter pattern.

## 21. Verification Requirements for BUILD Stage

Every requirement in this specification must have explicit verification evidence.

Minimum Suppliers gates:
- `pnpm install --frozen-lockfile`.
- Prisma generate.
- empty PostgreSQL database migration.
- lint with zero warnings.
- strict typecheck.
- unit tests.
- architecture tests.
- Suppliers module integration tests.
- API tests.
- permission tests.
- validation tests.
- audit tests.
- duplicate prevention tests.
- concurrent duplicate tests where applicable.
- transaction rollback tests for multi-write critical operations.
- optimistic-concurrency regression tests.
- responsive UI behavior verification.
- import validation/duplicate/retry/rollback tests.
- export permission/scope tests.
- production API build.
- production Web build.

A build alone is not sufficient evidence.

## 22. Change Control

This document is the Source of Truth for Suppliers v1.

After approval:
- no function is added or removed silently.
- any new owner request changing scope is a SUPPLIERS SPECIFICATION CHANGE REQUEST.
- any required Core modification is a separate CORE CHANGE REQUEST.
- implementation must not start another business module before Suppliers reaches the required stage/status.

## 23. Approved v1 Scope Summary

Suppliers v1 scope is approved as:

- supplier master data.
- Individual / Company supplier types.
- legal/trade identity.
- contact information.
- multiple contact persons with one primary.
- multiple addresses with one default.
- supplier categories and tags.
- Active / Suspended / Archived lifecycle.
- search and filters.
- duplicate detection and hard duplicate constraints for strong identifiers.
- permissions.
- audit.
- WhatsApp/copy-phone quick actions.
- supplier export.
- supplier import with safe validation, duplicate handling and retry safety.
- responsive Desktop / Tablet / Mobile UX.

Purchases, Accounting, Payments, Inventory, Cash/Treasury and transactional reporting remain integration responsibilities of their owning modules.

---

SPECIFICATION STATUS: APPROVED
NEXT ALLOWED STAGE: BUILD
NO SOURCE CODE IMPLEMENTATION IS INCLUDED IN THIS COMMIT.
