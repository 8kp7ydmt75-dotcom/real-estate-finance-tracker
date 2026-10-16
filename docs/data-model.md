# Data model

Projects scope all financial data. `project_members` associates authenticated users with owner, accountant or viewer roles. PostgreSQL RLS enforces project isolation for reads and writes, including RPC calls.

`units` retain tower/flat, floor, BHK, areas, ownership, explicit sold status, negotiated price, buyer information and handover date. IDs are UUIDs; display codes are unique within a project. Agreed price can override the area/rate formula. Buyer settlement is derived from confirmed sale value and cleared receipts, not a mutable checkbox.

`transactions` hold type, scope, unit UUID, amount, date, status, mode, party and a JSON-encoded details object containing description, work package and due date. Updates merge the prior object and compare the row version, so changing a note does not discard other fields. `request_id` identifies one submission and `invoice_id` optionally links a payment to an invoice.

`vendors` provide stable UUIDs within a project. A normalized name prevents case/whitespace variants from creating duplicate vendor accounts. The database resolves vendor IDs on writes and validates explicit invoice links against project, vendor and transaction type.

Buyer receipts require a sold developer unit. Landowner charges and reimbursements require a landowner unit. Project-wide transactions cannot retain a unit UUID. Transaction amounts must be positive, finite, within the supported range and limited to two decimals. Negative corrections use explicit editing or void/replacement with preserved history; refunds are a separate future workflow.

Only cleared cash movements enter cash totals. Invoices and landowner charges represent obligations regardless of the old settlement flag. Explicit invoice links are allocated first; unlinked vendor payments use FIFO by invoice date and ID. Remaining cash is a vendor advance. Matching is project-wide, and matched cash inherits its invoice's scope. Unit allocation uses integer paise with deterministic remainder distribution. The economic view absorbs landowner costs into developer units; the engineering view allocates across all units. Unallocated cost remains visible when no eligible units exist.

`finance_snapshot` returns one JSON result containing all active units/transactions and the current role from one statement. This avoids a silently truncated ledger and mismatched unit/transaction reads. Screen pagination does not change the calculation set.

`audit_events` is written by database triggers in the same transaction as each project/unit/transaction mutation. It stores server time, actor UUID, complete before/after records, action and void/archive reason. Application roles have read-only access. Legacy `transaction_audit_log` is retained. Units with financial history cannot be archived or change ownership; transactions are voided rather than physically deleted. Versions detect concurrent edits.

See [deployment-notes.md](deployment-notes.md) for migration, membership provisioning, accounting interpretation and known product boundaries.
