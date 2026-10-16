# Privacy Design

## Public Repository Rules

This public repository uses mock data only. It must not include:

- Real buyer or vendor records
- Real phone numbers, emails, Aadhaar, PAN, addresses, or payment references
- Real project agreements, PDFs, Excel files, invoices, or exported reports
- Real Supabase URLs or keys
- Frontend `service_role`, `sb_secret`, or backend-only credentials
- Private company or project branding assets

## Environment Files

`.env`, `.env.local`, and other environment files are ignored. The public repo includes only `.env.example` with placeholder values.

## Demo Data

Demo mode uses local TypeScript mock data. Names, phone placeholders, project names, vendors, and amounts are fictional and intentionally small enough to review.

## Deployment Guidance

Users deploying their own version should:

- Create their own Supabase project
- Store credentials in local or hosted environment variables
- Use only public anon or publishable keys in the frontend
- Keep service-role keys on trusted backend infrastructure only
- Keep the supplied project-member RLS policies enabled; provision authenticated users and project memberships

## Local Branding

Local logos can be placed under `public/local-brand-logo.*`, which is ignored by git. Runtime logo uploads are stored in browser local storage and are not written to the repository.
