import { getSupabaseClient, isDemoMode } from './supabaseClient';
import {
  NewProjectInput,
  NewTransactionInput,
  NewUnitInput,
  Project,
  ProjectStats,
  Transaction,
  TransactionScope,
  TransactionSide,
  Unit,
} from '../types/types';
import { getUnitCode } from '../utils/utils';
import { money } from '../utils/ledger';
import { validateTransaction, validateUnit } from '../validation/financeValidation';
import { demoProjects, demoTransactions, demoUnits } from '../data/demoData';

export type ProjectRole = 'owner' | 'accountant' | 'viewer';
export interface ProjectSnapshot {
  units: Unit[];
  transactions: Transaction[];
  role: ProjectRole;
}
type DemoProject = ProjectSnapshot & { history: Set<string>; requests: Set<string> };
const demoProjectsState = demoProjects.map((p) => ({ ...p, version: 1 }));
const demoData = new Map<string, DemoProject>(
  demoProjects.map((p, i) => [
    p.id,
    {
      units: i === 0 ? demoUnits.map((u) => ({ ...u, version: 1 })) : [],
      transactions: i === 0 ? demoTransactions.map((t) => ({ ...t, version: 1 })) : [],
      role: 'owner',
      requests: new Set(),
      history: new Set(
        i === 0 ? demoTransactions.flatMap((t) => (t.unitId ? [t.unitId] : [])) : [],
      ),
    },
  ]),
);
const clone = <T>(value: T): T => structuredClone(value);
const demo = (id: string) => {
  const data = demoData.get(id);
  if (!data) throw new Error('Project not found.');
  return data;
};
export const SUPABASE_SCHEMA_SETUP_ERROR =
  'Database setup is incomplete. Apply sql/supabase_setup.sql for a new database, or sql/20261016_finance_hardening.sql for an existing database.';
export const SUPABASE_RLS_SETUP_ERROR =
  'Access denied. Sign in with an account that is a member of this project. Ask the project owner to check your role.';
export const isSupabaseSchemaError = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  ['PGRST205', 'PGRST202', '42703'].includes(String((error as { code?: string }).code));
const fail = (error: unknown): void => {
  if (!error) return;
  if (isSupabaseSchemaError(error)) throw new Error(SUPABASE_SCHEMA_SETUP_ERROR);
  const e = error as { code?: string; message?: string };
  if (e.code === '42501') throw new Error(SUPABASE_RLS_SETUP_ERROR);
  throw new Error(e.message || 'Database request failed.');
};
// Database rows are validated by PostgreSQL constraints; this is the sole mapping boundary.
type Row = Record<string, any>;
const toProject = (r: Row): Project => ({
  id: r.id,
  code: r.code,
  name: r.name,
  location: r.location,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  version: r.version,
});
export const toUnit = (r: Row): Unit => ({
  id: r.id,
  version: r.version,
  tower: r.tower,
  flatNumber: r.flat_no,
  floor: Number(r.floor_no),
  bhk: r.bhk,
  carpetAreaSqFt: Number(r.carpet_area_sqft),
  saleableAreaSqFt: Number(r.saleable_area_sqft),
  ratePerSqFt: Number(r.rate_per_sqft),
  amenitiesCost: Number(r.amenities_cost),
  adjustments: Number(r.adjustments),
  agreedPrice: Number(r.agreed_price),
  buyerName: r.buyer_name || '',
  buyerPhone: r.buyer_phone || '',
  ownershipType: r.ownership_type,
  handoverTarget: r.handover_date || undefined,
  isSold: r.is_sold,
  isSettled: r.is_settled,
});
export const buildUnitPayload = (projectId: string, u: Unit) => ({
  project_id: projectId,
  unit_code: getUnitCode(u),
  tower: u.tower.trim(),
  flat_no: u.flatNumber.trim(),
  floor_no: u.floor,
  bhk: u.bhk,
  area_sqft: u.saleableAreaSqFt,
  carpet_area_sqft: u.carpetAreaSqFt,
  saleable_area_sqft: u.saleableAreaSqFt,
  ownership_type: u.ownershipType,
  buyer_name: u.buyerName.trim() || null,
  buyer_phone: u.buyerPhone.trim() || null,
  agreed_price:
    u.agreedPrice ?? money(u.saleableAreaSqFt * u.ratePerSqFt + u.amenitiesCost + u.adjustments),
  rate_per_sqft: u.ratePerSqFt,
  amenities_cost: u.amenitiesCost,
  adjustments: u.adjustments,
  handover_date: u.handoverTarget || null,
  is_sold: u.isSold,
  is_settled: false,
});
const dbType = (side: TransactionSide) => side.replaceAll(' ', '');
const sideFromDb = Object.fromEntries(
  Object.values(TransactionSide).map((side) => [dbType(side), side]),
);
export const toTransaction = (r: Row): Transaction => {
  let details: Record<string, string> = {};
  try {
    const parsed = typeof r.details === 'string' ? JSON.parse(r.details) : r.details;
    if (parsed && typeof parsed === 'object') details = parsed;
  } catch {
    details.description = r.details;
  }
  return {
    id: r.id,
    version: r.version,
    requestId: r.request_id,
    vendorId: r.vendor_id || undefined,
    invoiceId: r.invoice_id || undefined,
    unitId: r.unit_id || undefined,
    scope: r.scope,
    side: sideFromDb[r.type],
    amount: Number(r.amount),
    date: r.date,
    mode: r.mode || undefined,
    vendorName: r.party || undefined,
    workPackage: details.workPackage as Transaction['workPackage'],
    description: details.description,
    dueDate: details.dueDate,
    isSettled: r.status === 'Completed',
  };
};
const transactionPayload = (projectId: string, t: Transaction) => ({
  project_id: projectId,
  unit_id: t.scope === TransactionScope.PerUnit ? t.unitId : null,
  scope: t.scope || TransactionScope.ProjectWide,
  type: dbType(t.side),
  amount: t.amount,
  date: t.date,
  party: t.vendorName?.trim().replace(/\s+/g, ' ') || null,
  invoice_id: t.invoiceId || null,
  details: JSON.stringify({
    description: t.description || '',
    workPackage: t.workPackage || '',
    dueDate: t.dueDate || '',
  }),
  mode: t.mode || null,
  status: t.isSettled ? 'Completed' : 'Pending',
});
const conflict = () =>
  new Error('This record changed in another session. Reload the project and try again.');
const checkVersion = (previous: { version?: number }, next: { version?: number }) => {
  if (previous.version !== next.version) throw conflict();
};
const validProject = (input: NewProjectInput) => {
  const name = input.name.trim(),
    code = input.code.trim().toUpperCase();
  if (!name || !/^[A-Z0-9_]+$/.test(code))
    throw new Error('Enter a project name and a code containing letters, numbers or underscores.');
  return { name, code, location: input.location?.trim() || null };
};
export async function fetchAllProjects(): Promise<Project[]> {
  if (isDemoMode) return clone(demoProjectsState);
  const { data, error } = await getSupabaseClient().rpc('finance_projects');
  fail(error);
  return (data || []).map(toProject);
}
export async function fetchProjectStats(ids: string[]): Promise<Record<string, ProjectStats>> {
  if (isDemoMode)
    return Object.fromEntries(
      ids.map((id) => [
        id,
        {
          unitCount: demo(id).units.length,
          lastTransactionDate: demo(id)
            .transactions.map((t) => t.date)
            .sort()
            .at(-1),
        },
      ]),
    );
  const { data, error } = await getSupabaseClient().rpc('finance_project_stats');
  fail(error);
  return data || {};
}
export async function fetchProjectSnapshot(projectId: string): Promise<ProjectSnapshot> {
  if (isDemoMode) {
    const { units, transactions, role } = demo(projectId);
    return clone({ units, transactions, role });
  }
  const { data, error } = await getSupabaseClient().rpc('finance_snapshot', {
    target_project: projectId,
  });
  fail(error);
  if (!data?.role) throw new Error(SUPABASE_RLS_SETUP_ERROR);
  return {
    units: (data.units || []).map(toUnit),
    transactions: (data.transactions || []).map(toTransaction),
    role: data.role,
  };
}
export async function fetchUnits(projectId: string) {
  return (await fetchProjectSnapshot(projectId)).units;
}
export async function fetchTransactions(projectId: string) {
  return (await fetchProjectSnapshot(projectId)).transactions;
}
export async function createProject(input: NewProjectInput): Promise<Project> {
  const payload = validProject(input);
  if (isDemoMode) {
    if (demoProjectsState.some((p) => p.code === payload.code))
      throw new Error('Project code already exists.');
    const p = {
      ...payload,
      id: crypto.randomUUID(),
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    demoProjectsState.push(p);
    demoData.set(p.id, {
      units: [],
      transactions: [],
      history: new Set(),
      requests: new Set(),
      role: 'owner',
    });
    return clone(p);
  }
  const { data, error } = await getSupabaseClient().rpc('finance_create_project', { payload });
  fail(error);
  return toProject(data!);
}
export async function updateProject(
  id: string,
  input: Pick<NewProjectInput, 'name' | 'location'> & { version?: number },
): Promise<Project> {
  if (!input.name.trim()) throw new Error('Project name is required.');
  if (isDemoMode) {
    const p = demoProjectsState.find((p) => p.id === id);
    if (!p) throw new Error('Project not found.');
    checkVersion(p, input);
    Object.assign(p, input, { version: p.version + 1, updatedAt: new Date().toISOString() });
    return clone(p);
  }
  const { data, error } = await getSupabaseClient()
    .from('projects')
    .update({ name: input.name.trim(), location: input.location?.trim() || null })
    .eq('id', id)
    .eq('version', input.version ?? -1)
    .select()
    .maybeSingle();
  fail(error);
  if (!data) throw conflict();
  return toProject(data);
}
export async function createOrUpdateUnit(projectId: string, unit: Unit): Promise<Unit> {
  validateUnit(unit);
  const payload = buildUnitPayload(projectId, unit);
  if (isDemoMode) {
    const state = demo(projectId),
      old = state.units.find((u) => u.id === unit.id);
    if (unit.id && !old) throw conflict();
    if (old) checkVersion(old, unit);
    if (
      old &&
      state.history.has(old.id!) &&
      (old.ownershipType !== unit.ownershipType || (old.isSold && !unit.isSold))
    )
      throw new Error('A unit with financial history cannot change ownership or become unsold.');
    if (state.units.some((u) => u.id !== unit.id && getUnitCode(u) === getUnitCode(unit)))
      throw new Error('Unit code already exists in this project.');
    const next = {
      ...unit,
      id: unit.id || crypto.randomUUID(),
      agreedPrice: payload.agreed_price,
      version: (old?.version || 0) + 1,
    };
    if (old) state.units[state.units.indexOf(old)] = next;
    else state.units.push(next);
    return clone(next);
  }
  const query = unit.id
    ? getSupabaseClient()
        .from('units')
        .update(payload)
        .eq('project_id', projectId)
        .eq('id', unit.id)
        .eq('version', unit.version ?? -1)
    : getSupabaseClient().from('units').insert(payload);
  const { data, error } = await query.select().maybeSingle();
  fail(error);
  if (!data) throw conflict();
  return toUnit(data);
}
export async function createUnit(projectId: string, unit: NewUnitInput) {
  return createOrUpdateUnit(projectId, unit);
}
export async function updateUnit(projectId: string, unit: Unit) {
  if (!unit.id) throw new Error('Unit id is required.');
  return createOrUpdateUnit(projectId, unit);
}
export async function deleteUnit(
  projectId: string,
  id: string,
  reason: string,
  version: number,
): Promise<void> {
  if (!reason.trim()) throw new Error('An archive reason is required.');
  if (isDemoMode) {
    const state = demo(projectId);
    const existing = state.units.find((u) => u.id === id);
    if (!existing || existing.version !== version) throw conflict();
    if (state.history.has(id)) throw new Error('Units with financial history cannot be archived.');
    state.units = state.units.filter((u) => u.id !== id);
    return;
  }
  const { data, error } = await getSupabaseClient()
    .from('units')
    .update({ deleted_at: new Date().toISOString(), delete_reason: reason })
    .eq('project_id', projectId)
    .eq('id', id)
    .eq('version', version)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle();
  fail(error);
  if (!data) throw conflict();
}
export async function createTransaction(
  projectId: string,
  input: NewTransactionInput,
): Promise<Transaction> {
  const t = {
    ...input,
    scope:
      input.side === TransactionSide.BuyerReceipt
        ? TransactionScope.PerUnit
        : input.scope || TransactionScope.ProjectWide,
    requestId: input.requestId || crypto.randomUUID(),
  };
  const snapshot = await fetchProjectSnapshot(projectId);
  validateTransaction(t, snapshot.units, snapshot.transactions);
  if (isDemoMode) {
    const state = demo(projectId),
      prior = state.transactions.find((p) => p.requestId === t.requestId);
    if (prior) {
      if (
        JSON.stringify(transactionPayload(projectId, prior)) !==
        JSON.stringify(transactionPayload(projectId, t))
      )
        throw new Error(
          'This submission was already saved with different values. Reload before creating another transaction.',
        );
      return clone(prior);
    }
    if (state.requests.has(t.requestId))
      throw new Error(
        'This submission was already voided. Reload before creating another transaction.',
      );
    state.requests.add(t.requestId);
    const next = { ...t, id: crypto.randomUUID(), version: 1 };
    state.transactions.push(next);
    if (t.unitId) state.history.add(t.unitId);
    return clone(next);
  }
  const { data, error } = await getSupabaseClient().rpc('finance_create_transaction', {
    payload: { ...transactionPayload(projectId, t), request_id: t.requestId },
  });
  fail(error);
  return toTransaction(data);
}
export async function updateTransaction(
  projectId: string,
  id: string,
  partial: Partial<NewTransactionInput>,
): Promise<Transaction> {
  const snapshot = await fetchProjectSnapshot(projectId),
    previous = snapshot.transactions.find((t) => t.id === id);
  if (!previous) throw conflict();
  checkVersion(previous, partial);
  const next = { ...previous, ...partial };
  if (next.scope === TransactionScope.ProjectWide) next.unitId = undefined;
  validateTransaction(next, snapshot.units, snapshot.transactions);
  if (isDemoMode) {
    const state = demo(projectId);
    if (
      state.transactions.some((t) => t.invoiceId === id) &&
      (next.side !== previous.side || next.vendorName !== previous.vendorName)
    )
      throw new Error('Void linked payments before changing this invoice vendor or type.');
    next.version = (previous.version || 0) + 1;
    state.transactions[state.transactions.findIndex((t) => t.id === id)] = next;
    if (next.unitId) state.history.add(next.unitId);
    return clone(next);
  }
  const { data, error } = await getSupabaseClient()
    .from('transactions')
    .update(transactionPayload(projectId, next))
    .eq('project_id', projectId)
    .eq('id', id)
    .eq('version', previous.version!)
    .is('deleted_at', null)
    .select()
    .maybeSingle();
  fail(error);
  if (!data) throw conflict();
  return toTransaction(data);
}
export async function deleteTransaction(
  projectId: string,
  id: string,
  reason: string,
  version: number,
): Promise<void> {
  if (!reason.trim()) throw new Error('A void reason is required.');
  if (isDemoMode) {
    const state = demo(projectId);
    const existing = state.transactions.find((t) => t.id === id);
    if (!existing || existing.version !== version) throw conflict();
    if (state.transactions.some((t) => t.invoiceId === id))
      throw new Error('Void linked payments before voiding this invoice.');
    state.transactions = state.transactions.filter((t) => t.id !== id);
    return;
  }
  const { data, error } = await getSupabaseClient()
    .from('transactions')
    .update({ deleted_at: new Date().toISOString(), delete_reason: reason })
    .eq('project_id', projectId)
    .eq('id', id)
    .eq('version', version)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle();
  fail(error);
  if (!data) throw conflict();
}
