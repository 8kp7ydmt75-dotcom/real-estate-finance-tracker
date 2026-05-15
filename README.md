# Real Estate Finance Tracker

A project finance and operations dashboard for residential real-estate teams. It tracks inventory, buyer collections, vendor exposure, unit economics, and project-level profitability in one focused workspace.

This repo is intentionally generic: bring your own Supabase project, your own projects/units/transactions, and optionally your own logo.

## What It Solves

Real-estate finance often lives across spreadsheets, WhatsApp updates, vendor bills, and ad hoc notes. This app gives builders, developers, and project operators a structured place to answer practical questions:

- Which units are sold, unsold, settled, or assigned to landowners?
- How much has each buyer paid, and what is still due?
- What has been paid to vendors, what is still payable, and where are invoices overdue?
- What is the cost and margin per unit?
- How do project-wide costs allocate across all units?

## Features

- Multi-project workspace with project-scoped units and transactions
- Dashboard KPIs for revenue, collections, vendor payables, costs, and projected profit
- Developer and engineering views for economic versus all-unit cost analysis
- Unit list with buyer status, pricing, cost, margin, and balance due
- Unit detail pages for drilling into receipts, costs, and transaction history
- Transaction ledger for buyer receipts, vendor invoices, vendor payments, and landowner reimbursables
- Soft-delete and audit-aware transaction update flow
- Local branding support through environment variables and an in-app logo uploader

## Tech Stack

- React
- TypeScript
- Vite
- React Router
- Supabase
- Recharts
- Lucide React

## Local Setup

Install dependencies:

```bash
npm install
```

Create your local environment file:

```bash
cp .env.example .env.local
```

Fill in your Supabase project values:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_or_publishable_key
VITE_APP_NAME=Real Estate Finance Tracker
VITE_APP_LOGO_URL=
```

Use a public frontend key only: either the newer `sb_publishable_...` key or the legacy `anon` key. Never put a `service_role` or `sb_secret_...` key in this Vite app.

Create the database tables by running this in the Supabase SQL Editor:

```text
sql/supabase_setup.sql
```

If Row Level Security blocks local development writes, run:

```text
sql/supabase_local_rls_fix.sql
```

Start the app:

```bash
npm run dev
```

## Branding

The public default is `Real Estate Finance Tracker`.

For a private/local project, customize branding in `.env.local`:

```env
VITE_APP_NAME=Your Project Finance Dashboard
VITE_APP_LOGO_URL=/local-brand-logo.jpg
```

Place local-only logo files under `public/local-brand-logo.*`; these files are ignored by git. Users can also upload a logo from the sidebar while using the app. Uploaded logos are stored only in that browser's local storage.

## Available Scripts

```bash
npm run dev
npm run build
npm run preview
npm run test:dashboard
npm run check:supabase
```

## Privacy Notes

This repository does not include buyer data, project data, Supabase credentials, or private branding assets. Real project data should live in your own Supabase database and local `.env.local`, both outside version control.

Before publishing your own fork, check for secrets and personal data:

```bash
rg "VITE_SUPABASE|service_role|sb_secret|eyJ|phone|buyer|your-company-name"
```

## Repository Structure

```text
.
├── App.tsx
├── appContext.tsx
├── components/
├── dataService.ts
├── scripts/
├── sql/
├── supabaseClient.ts
├── transactionValidation.ts
├── types.ts
└── utils.ts
```

## Suggested Next Steps

- Add authentication and role-based access for production use
- Replace local RLS bypass with policies that match your team
- Add import/export workflows for existing spreadsheets
- Add screenshots or a demo dataset for portfolio presentation
