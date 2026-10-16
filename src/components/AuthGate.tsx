import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient, isDemoMode, supabaseConfigError } from '../services/supabaseClient';

export default function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!isDemoMode && !supabaseConfigError);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (isDemoMode || supabaseConfigError) return;
    let active = true;
    const client = getSupabaseClient();
    void client.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return;
        setSession(data.session);
        setLoading(false);
        if (error) setError(error.message);
      })
      .catch(() => {
        if (active) {
          setError('Unable to restore your session. Please sign in.');
          setLoading(false);
        }
      });
    const { data } = client.auth.onAuthStateChange((_event, next) => {
      if (active) {
        setSession(next);
        setLoading(false);
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  if (isDemoMode)
    return (
      <>
        <div className="bg-amber-100 px-4 py-2 text-center text-sm">
          Demo data only. Changes reset when you reload this page.
        </div>
        {children}
      </>
    );
  if (supabaseConfigError)
    return (
      <main className="p-8">
        <h1 className="text-xl font-bold">Configuration required</h1>
        <p role="alert">{supabaseConfigError.message}</p>
      </main>
    );
  if (loading)
    return (
      <p role="status" className="p-8">
        Restoring session…
      </p>
    );
  if (session)
    return (
      <div key={session.user.id}>
        <div className="flex justify-end items-center gap-3 bg-slate-100 px-4 py-2 text-sm">
          <span>{session.user.email}</span>
          <button
            type="button"
            onClick={async () => {
              const { error } = await getSupabaseClient().auth.signOut();
              if (error) setError(error.message);
            }}
          >
            Sign out
          </button>
          {error && <span role="alert">{error}</span>}
        </div>
        {children}
      </div>
    );
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-slate-100">
      <form
        className="space-y-4 bg-white p-8 rounded-xl w-full max-w-md"
        onSubmit={async (event) => {
          event.preventDefault();
          if (saving) return;
          const fields = new FormData(event.currentTarget);
          setSaving(true);
          setError('');
          try {
            const { error } = await getSupabaseClient().auth.signInWithPassword({
              email: String(fields.get('email')),
              password: String(fields.get('password')),
            });
            if (error) setError(error.message);
          } catch {
            setError('Sign-in failed. Check your connection and try again.');
          } finally {
            setSaving(false);
          }
        }}
      >
        <h1 className="text-2xl font-semibold">Sign in to Builder Ledger</h1>
        <p className="text-sm text-slate-600">
          Use the account invited by your project administrator.
        </p>
        <label className="block">
          Email
          <input
            name="email"
            type="email"
            autoComplete="username"
            required
            className="form-control"
          />
        </label>
        <label className="block">
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="form-control"
          />
        </label>
        {error && (
          <p role="alert" className="text-rose-700">
            {error}
          </p>
        )}
        <button type="submit" disabled={saving} className="dashboard-primary-button">
          {saving ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
