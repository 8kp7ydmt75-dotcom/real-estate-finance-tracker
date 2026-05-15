# Contributing

Thanks for improving Builder Ledger India. This project is intended to stay useful for builders and developers while remaining safe for a public repository.

## Run Locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

For a no-backend demo, keep:

```env
VITE_DEMO_MODE=true
```

For Supabase mode, set `VITE_DEMO_MODE=false` and provide your own Supabase URL and public anon or publishable key.

## Pull Requests

- Open an issue or PR with a clear description of the workflow you are improving.
- Keep changes focused and easy to review.
- Run `npm run build` before opening a PR.
- Run `npm run test:dashboard` when financial calculations change.

## Privacy Rules

Never commit:

- Real buyer names, phone numbers, emails, Aadhaar, PAN, or address data
- Real vendor bills, payment records, agreements, PDFs, Excel files, or exported reports
- Real Supabase URLs or keys
- `service_role`, `sb_secret`, private JWTs, or backend-only secrets
- Private branding assets unless they are deliberately generic and safe to publish

## Demo Data Rules

- Use mock/demo data only.
- Prefer clearly fake names, placeholder phone formats, and rounded sample amounts.
- Do not copy values from a real project and "lightly anonymize" them.
- Keep demo records small enough for reviewers to understand quickly.

## Security Notes

The local RLS bypass SQL is for private development only. Public Supabase-backed deployments must use real authentication and RLS policies.
