# Deployment Notes

## Local Demo Mode

Demo mode is the safest way to review the product without a backend:

```env
VITE_DEMO_MODE=true
```

In demo mode, the app uses local mock data from `src/data/demoData.ts` and does not require Supabase credentials.

## Supabase Mode

To use Supabase:

```env
VITE_DEMO_MODE=false
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_or_publishable_key
```

Run `sql/supabase_setup.sql` in the Supabase SQL Editor to create the base schema.

## Local RLS Bypass

`sql/supabase_local_rls_fix.sql` disables RLS for local/private testing. This is convenient for early development, but it is not a production security model.

## Production RLS Warning

Never deploy a public Supabase-backed app with RLS disabled.

Before production:

- Enable RLS on every table
- Add organization or tenant ownership fields
- Add memberships and roles
- Restrict reads and writes to authorized users
- Keep service-role keys out of the frontend
- Review `sql/supabase_production_rls_policies.sql` as a starter template only

## Hosting

The app is a Vite frontend and can be hosted on platforms such as Vercel, Netlify, Cloudflare Pages, or a static hosting pipeline. Set environment variables in the hosting provider dashboard instead of committing them.
