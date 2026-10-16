# Builder Ledger India — Real Estate Finance Tracker

An India-focused real estate finance and operations dashboard for builders and developers to manage apartment inventory, buyer collections, vendor payables, landowner allocations, unit economics, and project-level profitability.

The public repository uses mock data only. It does not include real buyer names, real phone numbers, private project records, invoices, PDFs, Excel files, Supabase credentials, or private branding assets.

## Overview

Builder Ledger India is a full-stack dashboard for residential real-estate project control. It helps teams track flat inventory, buyer receipts, vendor invoices, vendor payments, landowner reimbursements, and unit-level margins from one structured workspace.

The app supports two operating modes:

- Demo mode: local mock data, no backend required
- Supabase mode: project, unit, transaction, and audit-log data stored in Supabase PostgreSQL

## Why This Exists

Many small and mid-sized Indian builders still coordinate project finance through Excel sheets, WhatsApp messages, vendor calls, and memory. That creates operational risk:

- buyer dues are hard to reconcile with agreed sale value
- vendor invoices and payments are tracked separately
- landowner allocations are easy to miss
- project-wide costs are difficult to allocate across units
- margin discussions happen without a reliable source of truth

Builder Ledger India turns those workflows into a focused finance operations system.

## Key Features

- Multi-project workspace
- Apartment inventory with developer and landowner ownership views
- Buyer receipt tracking and balance due calculations
- Vendor invoice and vendor payment ledger
- Project-wide and per-unit transaction scopes
- Landowner reimbursable expense tracking
- Unit cost allocation by total built-up area
- Unit-level margin visibility
- Dashboard KPIs for agreed sales, cleared collections, cost exposure, payables, buyer credits and contracted sales less recorded exposure
- Authenticated project roles, immutable server audit history and versioned edits
- Invoice-linked payments, idempotent submissions and safe transaction voiding
- Audit-aware transaction updates and soft deletes
- Local branding through environment variables or runtime logo upload

## India-Specific Workflows

- Apartment/flat inventory with tower, floor, flat number, BHK, carpet area, and total built-up area
- Buyer collections through NEFT, RTGS, UPI, cheque, or cash
- Vendor payables for construction work packages
- Landowner and developer unit separation for joint-development projects
- Landowner reimbursable tracking for owner-side unit expenses
- Project-wide construction cost allocation across units

## Demo Mode

Demo mode works without Supabase and is enabled by default in `.env.example`:

```env
VITE_DEMO_MODE=true
```

The demo dataset lives in `src/data/demoData.ts` and includes:

- sample project: Demo Heights
- developer and landowner units
- buyer receipts
- vendor invoices
- vendor payments
- landowner reimbursable records
- project-wide construction costs

All demo records are fictional.

## Architecture

```text
Supabase PostgreSQL / Demo JSON Data
        ↓
services/dataService.ts
        ↓
React Context
        ↓
Dashboard / Unit List / Unit Detail / Transaction Ledger
```

- Supabase stores projects, units, transactions, and audit logs.
- Demo mode uses local mock data from `src/data/demoData.ts`.
- `services/dataService.ts` handles database/demo data access and mapping.
- React Context manages active project state.
- Components render dashboards, unit views, and ledgers.
- `validation/transactionValidation.ts` keeps financial rules outside the UI.

## Screenshots

Placeholder images are included so these links render. Replace them with real screenshots from demo mode before sharing the project widely.

![Dashboard](docs/screenshots/dashboard.png)
![Unit List](docs/screenshots/unit-list.png)
![Transaction Ledger](docs/screenshots/transaction-ledger.png)

To capture screenshots manually:

1. Run `npm install`.
2. Copy `.env.example` to `.env.local` and keep `VITE_DEMO_MODE=true`.
3. Run `npm run dev`.
4. Open the Demo Heights project.
5. Capture:
   - Dashboard: project overview page
   - Unit List: `/units` screen
   - Transaction Ledger: `/transactions` screen
6. Save them as:
   - `docs/screenshots/dashboard.png`
   - `docs/screenshots/unit-list.png`
   - `docs/screenshots/transaction-ledger.png`

## Tech Stack

- React
- TypeScript
- Vite
- React Router
- Supabase
- Recharts
- Lucide React

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Default demo `.env.local`:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_or_publishable_key
VITE_DEMO_MODE=true
VITE_APP_NAME=Builder Ledger India — Real Estate Finance Tracker
VITE_APP_LOGO_URL=
```

## Supabase Setup

For a new database, run `sql/supabase_setup.sql`, provision a confirmed Supabase Auth user, and deploy with `VITE_DEMO_MODE=false` plus your public Supabase URL/key. Sign in to create a project; its creator becomes its owner.

For an existing database, back up first, run `sql/preflight_finance_hardening.sql`, then apply `sql/20261016_finance_hardening.sql` and assign users to existing projects. The frontend now requires authentication and the secured schema. **Do not disable RLS.** The old bypass scripts are retired.

Read [deployment and migration instructions](docs/deployment-notes.md) before upgrading. They cover role provisioning, legacy data review and post-deployment checks. Never expose a service-role/secret key in the frontend.

## Verification

Use Node 24 (minimum 22.12).

```bash
npm ci
npm run check
npm run test:dashboard
npx playwright install chromium
npm run test:e2e
npm audit
```

Tests cover financial reconciliation, paise allocation, pending cash, credits, project isolation, idempotency, stale edits, permissions, atomic audit records, fresh/upgrade migrations, 1,000+ row snapshots, authentication and browser workflows. GitHub Actions runs these checks on pushes and pull requests. `npm run check:supabase` additionally verifies a configured live backend; see the deployment guide for its authenticated token requirement.

## Privacy And Data Safety

This public repository is designed to be privacy-safe:

- mock data only
- no real buyer/vendor/payment records
- no real phone numbers or emails
- no Aadhaar or PAN data
- no Excel, CSV, PDF, DOCX, agreements, invoices, or private exports
- no `.env.local`
- no Supabase service-role or secret keys
- no private branding assets

Before publishing your own fork, run a privacy scan:

```bash
rg "your-project-name|your-company-name|real-buyer-name|Aadhaar|PAN|service[_-]?role|sb_secret|eyJ|[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}" -i
find . -name '*.xlsx' -o -name '*.csv' -o -name '*.pdf' -o -name '*.docx'
```

## Documentation

- [Product brief](docs/product-brief.md)
- [Data model](docs/data-model.md)
- [Privacy design](docs/privacy-design.md)
- [Deployment notes](docs/deployment-notes.md)

## Roadmap

- CSV import templates for units and opening ledgers
- Exportable project finance reports
- Aging reports for buyer dues and vendor payables
- Screenshot-backed demo walkthrough

## Resume Summary

Built a full-stack real estate finance and operations dashboard for Indian residential builders using React, TypeScript, Vite, and Supabase. The app tracks apartment inventory, buyer collections, vendor payables, landowner allocations, unit economics, audit-aware transaction updates, and project-level profitability using a privacy-safe mock dataset for public demonstration.

## License

MIT
