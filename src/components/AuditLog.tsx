import { useEffect, useState } from 'react';
import { useApp } from '../context/appContext';
import { getSupabaseClient, isDemoMode } from '../services/supabaseClient';

interface AuditEvent {
  id: number;
  occurred_at: string;
  actor_id: string | null;
  entity: string;
  entity_id: string;
  action: string;
  reason: string | null;
  old_record: unknown;
  new_record: unknown;
}
export default function AuditLog() {
  const { activeProject } = useApp();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    setPage(0);
  }, [activeProject?.id]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    if (isDemoMode || !activeProject) {
      setEvents([]);
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        const { data, error } = await getSupabaseClient()
          .from('audit_events')
          .select('*')
          .eq('project_id', activeProject.id)
          .order('id', { ascending: false })
          .range(page * 50, page * 50 + 49);
        if (error) throw error;
        if (active) setEvents(data || []);
      } catch (error) {
        if (active)
          setError(error instanceof Error ? error.message : 'Could not load audit events.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [activeProject?.id, page]);
  return (
    <section className="dashboard-surface space-y-4">
      <h1 className="text-2xl font-semibold">Audit history</h1>
      <p className="text-sm text-slate-600">
        Server-recorded changes, including voided transactions. Earlier field-level audit records
        remain in the legacy audit table.
      </p>
      {isDemoMode && (
        <p>Persistent audit history is available in Supabase mode. Demo changes reset on reload.</p>
      )}
      {error && (
        <p role="alert" className="text-rose-700">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Loading audit history…</p>
      ) : (
        events.map((event) => (
          <details key={event.id} className="border border-slate-200 rounded-lg p-3">
            <summary className="cursor-pointer">
              {new Date(event.occurred_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}{' '}
              IST · {event.action} · {event.entity} · {event.reason || event.entity_id}
            </summary>
            <p className="my-2 text-sm">
              Actor: {event.actor_id || 'Database administrator / migration'}
            </p>
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <h2>Before</h2>
                <pre className="overflow-auto text-xs max-h-80">
                  {JSON.stringify(event.old_record, null, 2)}
                </pre>
              </div>
              <div>
                <h2>After</h2>
                <pre className="overflow-auto text-xs max-h-80">
                  {JSON.stringify(event.new_record, null, 2)}
                </pre>
              </div>
            </div>
          </details>
        ))
      )}
      {!loading && !error && !events.length && !isDemoMode && <p>No audit events on this page.</p>}
      <div className="flex gap-4">
        <button disabled={page === 0 || loading} onClick={() => setPage((p) => p - 1)}>
          Previous
        </button>
        <span>Page {page + 1}</span>
        <button disabled={events.length < 50 || loading} onClick={() => setPage((p) => p + 1)}>
          Next
        </button>
      </div>
    </section>
  );
}
