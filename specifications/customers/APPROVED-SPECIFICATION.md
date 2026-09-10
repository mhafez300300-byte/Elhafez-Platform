# Elhafez Platform — Customers Module Approved Specification

Status: APPROVED SPECIFICATION
Module: customers
Version: 1.0
Baseline Core: Elhafez Platform Core v1.0
Baseline Commit: b1dee7754f9a7c066b0eb602fda612b5c4d502f2
Approved by Owner: Yes

## 1. Purpose

The Customers module owns the customer master record for a company. It is responsible for customer identity, contact information, addresses, classification, lifecycle status, duplicate detection, customer-facing quick actions, permissions and audit integration.

It must not become the owner of accounting, sales, payments, loyalty, clinic patient, tourism traveler, inventory, or other domain data.

## 2. Architecture and Ownership Rules

- Implementation must live under `modules/customers/` and follow `MODULE-STANDARD.md` and `templates/module-template/`.
- The module owns only its own customer-domain tables.
- No direct access to another module's tables, repositories, internal services, infrastructure, or source files.
- Cross-module collaboration is allowed only through approved public contracts, application services/interfaces, or domain events.
- No circular dependencies.
- No Core changes are approved by this specification.
- If implementation reveals a genuine Core deficiency, stop and raise a separate CORE CHANGE REQUEST before modifying Core.

## 3. Customer Entity — Required Data

### 3.1 Core Identity
- `id`: internal immutable identifier.
- `companyId`: owning company scope.
- `customerCode`: system-generated human-readable code, unique within company.
- `customerType`: `INDIVIDUAL` or `COMPANY`.
- `fullName`: required display/customer name.
- `tradeName`: optional; mainly for company customers.

### 3.2 Contact Information
- `primaryPhone`: optional.
- `secondaryPhone`: optional.
- `whatsappPhone`: optional.
- `email`: optional.
- Phone values must be normalized before persistence/comparison.

### 3.3 Legal / Identification Information
- `nationalId`: optional for individuals.
- `taxNumber`: optional for companies.
- `commercialRegistration`: optional.
- Strong identifiers must support duplicate prevention within the same company where present.

### 3.4 Optional Personal Information
- `birthDate`: optional.
- `gender`: optional and only exposed when useful to the consuming product.

### 3.5 Classification
- `categoryId` or equivalent owned customer category reference.
- zero or more customer tags owned by Customers.
- `source`: optional lead/customer source such as direct visit, phone, WhatsApp, referral, website, or other.

### 3.6 Notes
- general customer notes owned by the Customers module.
- notes must not be used to store accounting balances or transactional data.

## 4. Customer Addresses

The module must support multiple addresses per customer.

Each address may include:
- label/name such as Home, Work, Branch.
- governorate/region.
- city/area.
- street.
- extra details.
- landmark.
- optional address phone.
- default flag.

Rules:
- zero or more addresses allowed.
- at most one default address per customer.
- user can add, edit and deactivate/remove an unused address according to domain rules.
- changing the default address must be transaction-safe.

## 5. Status Lifecycle

Supported statuses:
- `ACTIVE`
- `SUSPENDED`
- `ARCHIVED`

Rules:
- Active customers are available for normal use.
- Suspended customers remain readable but may be blocked from new downstream transactions according to consuming-module business rules.
- Archived customers are hidden from default operational lists but remain searchable/viewable with proper permission.
- No normal hard-delete action is part of Customers v1.

## 6. Screens

### 6.1 Customer List
Must provide:
- customer code.
- name.
- primary phone.
- type.
- category.
- city when available.
- status.
- last update timestamp.
- direct open action.

### 6.2 Add / Edit Customer
Logical sections:
- Basic Data.
- Contact Information.
- Addresses.
- Classification.
- Notes.

Actions:
- Save.
- Save and Add Another.
- Cancel.

No dead buttons, placeholders or UI-only fields are allowed.

### 6.3 Customer Profile
Must show customer-owned data only:
- identity/basic data.
- contact information.
- addresses.
- classification/tags.
- notes.
- lifecycle status.
- audit/history access.

Future tabs for Sales, Payments, Accounting, Bookings, etc. may appear only when the owning modules and integrations exist. Customers must not fake or locally duplicate those datasets.

## 7. Actions

Customers v1 includes:
- Create customer.
- View customer.
- Edit customer.
- Change status.
- Add address.
- Edit address.
- set default address.
- deactivate/remove address where allowed.
- copy phone number.
- open WhatsApp using an existing saved WhatsApp/phone number.
- view audit history when authorized.
- Quick Add Customer for use by future consuming modules.

## 8. Quick Add Customer

Quick Add must allow a minimal customer record to be created rapidly from a future transactional screen.

Minimum intended input:
- name.
- phone when available.

It must still apply normalization, duplicate detection, permissions, company scope and audit rules.

The customer profile can be completed later.

## 9. Search and Filters

Search must support, as applicable:
- full name.
- customer code.
- primary/secondary/WhatsApp phone.
- email.
- national ID.
- tax number.
- trade name.

Filters:
- status.
- customer type.
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

### 10.2 Soft Duplicate Warning
Before creating a customer, the system should surface likely duplicates based on matching/similar:
- name.
- phone.
- WhatsApp number.
- trade name.

Phone duplication is not an automatic hard block because family/company contacts may legitimately share a phone.

### 10.3 Concurrency
Duplicate protection must remain correct under concurrent requests and retries; UI checks alone are insufficient.

## 11. Validation

- `fullName` required.
- `customerType` required.
- `companyId` must come from authorized scope, not trusted from arbitrary client input.
- email must be valid when supplied.
- phone numbers normalized when supplied.
- strong identifiers validated and constrained where applicable.
- at most one default address.
- cross-company access forbidden.
- archived-state modifications must obey explicit domain/permission rules.

Phone is not mandatory in Customers v1.

## 12. Permissions

Customers v1 requires explicit permission contracts for at least:
- `customers.view`
- `customers.create`
- `customers.update`
- `customers.change-status`
- `customers.view-sensitive`
- `customers.export`

If import is built in the approved v1 scope, also:
- `customers.import`

No customer hard-delete permission is part of v1.

All permissions must respect the Core company/branch scope model where applicable.

## 13. Audit

Auditable actions include at least:
- customer created.
- customer updated.
- sensitive identifier changed.
- contact information changed.
- address created/updated/deactivated.
- default address changed.
- status changed.
- classification changed.

Audit must use the approved platform audit contract/event mechanism and include relevant actor, company, branch, entity, before/after state, metadata and request/request-correlation identifier according to Core standards.

## 14. Retry, Idempotency and Transaction Safety

Create/update operations must be safe against:
- double click.
- client retry.
- network retry.
- duplicate concurrent requests.

Database constraints and transaction boundaries must protect invariants.

Multi-write operations such as customer + initial addresses or default-address changes must obey:

ALL SUCCESS -> COMMIT
ANY FAILURE -> FULL ROLLBACK

No partial customer/address state is acceptable.

## 15. UX / Responsive Requirements

### Desktop
- full customer table.
- visible search and filters.
- clear primary actions.
- efficient profile/edit experience.

### Tablet
- reduced visible columns.
- important actions remain accessible.

### Mobile
- customer-card/list presentation rather than an unusable wide compressed table.
- persistent/easy-to-access search.
- obvious Add Customer action.
- cards should prioritize name, phone, code and status.

UI must remain fully functional at each supported breakpoint.

## 16. Customer Categories and Tags

Customers v1 includes customer classification and tags.

Examples may include VIP, Wholesale, Company, Regular, Distributor, but implementation must not hard-code pharmacy-only semantics into the platform-level Customers module.

The module should support reusable configurable customer categories/tags suitable across Elhafez Platform products.

## 17. Import / Export

Approved commercial requirement:
- Customers export is included in v1 and guarded by `customers.export`.
- Customer import is approved for v1 because migration from existing systems is commercially important.

Import must:
- validate rows before/while processing.
- normalize phones.
- detect strong duplicates.
- report rejected rows clearly.
- avoid partial corruption.
- not bypass permissions or company scope.

Import must not silently overwrite existing customers.

## 18. Explicitly Out of Customers Module Ownership

The following capabilities are NOT owned or persisted by Customers and must be implemented later through the proper owning module/integration:

- Opening balance -> Accounting integration.
- Current balance -> Accounting.
- Used credit / debt balance -> Accounting/Credit integration.
- Credit-limit consumption -> Accounting/Credit integration.
- Sales invoices -> Sales.
- Sales returns -> Sales/Returns.
- Collections/receipts -> Payments/Accounting.
- Customer statement -> Accounting/Reporting.
- Loyalty points/rewards -> Loyalty.
- Medical file/prescriptions -> Clinic/Patients.
- Traveler/passport/visa information -> Tourism/Travelers or Booking.
- Inventory data -> Inventory.

Customers may expose public contracts needed by these modules, but it must not directly read or write their private tables or logic.

## 19. Future Integration Contracts — Design Intent

Customers should expose only the minimum stable public surface needed by other modules, such as:
- resolve customer identity by ID within authorized company scope.
- retrieve safe public customer summary.
- check customer lifecycle availability for downstream use.
- public customer-created/updated/status-changed events where needed.

Exact contract signatures are a BUILD-stage design detail and must conform to repository standards without leaking internal persistence models.

## 20. Error Handling

Expected error classes/scenarios include:
- validation failure.
- forbidden/permission denied.
- customer not found.
- duplicate strong identifier.
- invalid status transition.
- invalid/default-address conflict.
- concurrent update conflict if optimistic concurrency/versioning is used.
- cross-company access attempt.

API failures must use the approved typed AppError/UnifiedErrorFilter pattern.

## 21. Verification Requirements for BUILD Stage

Every requirement in this specification must have explicit verification evidence.

Minimum Customers gates:
- `pnpm install --frozen-lockfile`.
- Prisma generate.
- empty PostgreSQL database migration.
- lint with zero warnings.
- strict typecheck.
- unit tests.
- architecture tests.
- Customers module integration tests.
- API tests.
- permission tests.
- validation tests.
- audit tests.
- duplicate prevention tests.
- concurrent duplicate tests where applicable.
- transaction rollback tests for multi-write critical operations.
- responsive UI behavior verification.
- import validation/duplicate/rollback tests.
- production API build.
- production Web build.

A build alone is not sufficient evidence.

## 22. Change Control

This document is the Source of Truth for Customers v1.

After approval:
- no function is added or removed silently.
- any new owner request changing scope is a CHANGE REQUEST.
- any required Core modification is a separate CORE CHANGE REQUEST.
- implementation must not start another business module before Customers reaches the required stage/status.

## 23. Approved v1 Scope Summary

Customers v1 scope is approved as:

- customer master data.
- Individual / Company customer types.
- contact information.
- multiple addresses with one default.
- customer categories and tags.
- optional customer source.
- Active / Suspended / Archived lifecycle.
- search and filters.
- duplicate detection and hard duplicate constraints for strong identifiers.
- permissions.
- audit.
- Quick Add Customer.
- WhatsApp quick action.
- customer export.
- customer import with safe validation and duplicate handling.
- responsive Desktop / Tablet / Mobile UX.

Accounting, Sales, Payments, Loyalty, Clinic and Tourism transactional data remain integration responsibilities of their owning modules.

---

SPECIFICATION STATUS: APPROVED
NEXT ALLOWED STAGE: BUILD
NO SOURCE CODE IMPLEMENTATION IS INCLUDED IN THIS COMMIT.
