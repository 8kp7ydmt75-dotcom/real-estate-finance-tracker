# Data Model

## Projects

Projects represent a real-estate development workspace. Each project scopes its own units and transactions so multiple developments can be managed without mixing ledgers.

Key fields:

- code
- name
- location
- created and updated timestamps

## Units

Units represent apartments or flats inside a project.

Key fields:

- tower and flat number
- floor and BHK
- carpet area and total built-up area
- ownership type: Developer or Landowner
- agreed price, rate, amenities, and adjustments
- buyer name and buyer phone
- sold and settled status
- handover target

## Transactions

Transactions represent financial ledger events. They can be project-wide or tied to a specific unit.

Core transaction fields:

- side/type
- scope: ProjectWide or PerUnit
- amount
- date
- payment mode
- vendor or party name
- work package
- due date
- settlement status
- description

## Buyer Receipts

Buyer receipts are per-unit transactions that reduce buyer balance due. The app separates cash received from agreed sale value so collections and revenue are not confused.

## Vendor Invoices

Vendor invoices represent payable exposure. Project-wide invoices are allocated across units for economic reporting. Per-unit invoices attach directly to a flat.

## Vendor Payments

Vendor payments represent cash paid to vendors. Vendor-level matching prevents a payment to one vendor from accidentally offsetting another vendor's invoice.

## Landowner Reimbursables

Landowner reimbursable transactions track costs incurred for landowner units and any reimbursements received. This helps builders keep JV or landowner settlement conversations explicit.

## Audit Logs

Audit logs capture material edits to financial transactions, including old value, new value, changed field, reason, timestamp, and user marker. They are designed to support audit-aware operations rather than silent overwrites.
