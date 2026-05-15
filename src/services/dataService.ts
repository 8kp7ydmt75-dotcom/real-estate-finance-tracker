import { getSupabaseClient, isDemoMode } from './supabaseClient';
import {
  NewProjectInput,
  NewTransactionInput,
  NewUnitInput,
  OwnershipType,
  Project,
  ProjectStats,
  Transaction,
  TransactionScope,
  TransactionSide,
  Unit
} from '../types/types';
import { assertPerUnitRequiresUnit } from '../validation/transactionValidation';
import { getUnitCode, getUnitKey } from '../utils/utils';
import { demoProjects, demoTransactions, demoUnits } from '../data/demoData';

const SYSTEM_USER = 'system';
const demoState = {
  projects: demoProjects.map(project => ({ ...project })),
  units: demoUnits.map(unit => ({ ...unit })),
  transactions: demoTransactions.map(transaction => ({ ...transaction }))
};

const cloneProject = (project: Project): Project => ({ ...project });
const cloneUnit = (unit: Unit): Unit => ({ ...unit });
const cloneTransaction = (transaction: Transaction): Transaction => ({ ...transaction });
const buildDemoId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const isDemoProject = (projectId: string) => demoState.projects.some(project => project.id === projectId);

const getDemoUnit = (projectId: string, unitRef?: string) => {
  if (!unitRef || !isDemoProject(projectId)) return undefined;
  return demoState.units.find(unit => unit.id === unitRef || getUnitCode(unit) === unitRef);
};

const ensureDemoProject = (projectId: string) => {
  if (!isDemoProject(projectId)) throw new Error('Demo project was not found.');
};

export const SUPABASE_SCHEMA_SETUP_ERROR = 'Supabase database tables are not set up yet. Run sql/supabase_setup.sql in the Supabase SQL Editor, then refresh the app.';
export const SUPABASE_RLS_SETUP_ERROR = 'Supabase Row Level Security is blocking this app. Run sql/supabase_local_rls_fix.sql in the Supabase SQL Editor, then refresh the app.';

export const isSupabaseSchemaError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;

  const candidate = error as { code?: string; message?: string };
  return candidate.code === 'PGRST205'
    || candidate.message?.includes('schema cache') === true
    || candidate.message?.includes("Could not find the table 'public.") === true;
};

const throwIfDataError = (error: unknown) => {
  if (!error) return;
  if (isSupabaseSchemaError(error)) {
    throw new Error(SUPABASE_SCHEMA_SETUP_ERROR);
  }
  if (typeof error === 'object' && (error as { message?: string }).message?.includes('row-level security policy')) {
    throw new Error(SUPABASE_RLS_SETUP_ERROR);
  }
  throw error;
};

const cleanPayload = (obj: Record<string, any>) =>
  Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));

const toProject = (row: any): Project => ({
  id: row.id,
  code: row.code,
  name: row.name,
  location: row.location ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const normalizeProjectCode = (code: string) => code.trim().toUpperCase();

const validateProjectInput = (input: NewProjectInput) => {
  const code = normalizeProjectCode(input.code);
  const name = input.name.trim();

  if (!name) throw new Error('Project name is required.');
  if (!code) throw new Error('Project code is required.');
  if (!/^[A-Z0-9_]+$/.test(code)) {
    throw new Error('Project code can only contain uppercase letters, numbers, and underscores.');
  }

  return {
    code,
    name,
    location: input.location?.trim() || null
  };
};

const throwProjectCodeError = (error: unknown) => {
  const candidate = error as { code?: string; message?: string } | null;
  if (candidate?.code === '23505' || candidate?.message?.toLowerCase().includes('duplicate key')) {
    throw new Error('Project code already exists.');
  }
  throwIfDataError(error);
};

const throwUnitCodeError = (error: unknown) => {
  const candidate = error as { code?: string; message?: string } | null;
  if (candidate?.code === '23505' || candidate?.message?.toLowerCase().includes('duplicate key')) {
    throw new Error('Unit code already exists in this project.');
  }
  throwIfDataError(error);
};

const toUnit = (row: any): Unit => {
  const carpetAreaSqFt = Number(row.carpet_area_sqft ?? row.area_sqft ?? 0);
  const saleableAreaSqFt = Number(row.saleable_area_sqft ?? row.area_sqft ?? 0);
  const agreedPrice = Number(row.agreed_price ?? 0);
  const rawAmenitiesCost = Number(row.amenities_cost ?? 0);
  const rawAdjustments = Number(row.adjustments ?? 0);
  const rawRate = Number(row.rate_per_sqft ?? 0);
  const derivedRate = saleableAreaSqFt > 0
    ? Math.max(0, (agreedPrice - rawAmenitiesCost - rawAdjustments) / saleableAreaSqFt)
    : 0;

  return {
    id: row.id,
    tower: row.tower,
    flatNumber: row.flat_no,
    floor: Number(row.floor_no ?? 0),
    bhk: row.bhk,
    carpetAreaSqFt,
    saleableAreaSqFt,
    ratePerSqFt: rawRate > 0 ? rawRate : derivedRate,
    amenitiesCost: rawAmenitiesCost,
    adjustments: rawAdjustments,
    agreedPrice,
    buyerName: row.buyer_name || '',
    buyerPhone: row.buyer_phone || '',
    ownershipType: row.ownership_type || OwnershipType.Developer,
    handoverTarget: row.handover_date || undefined,
    isSold: Boolean(row.is_sold) || Boolean(row.buyer_name),
    isSettled: Boolean(row.is_settled)
  };
};

const buildUnitStatus = (unit: Unit) => {
  if (unit.ownershipType === OwnershipType.Landowner) return 'Landowner';
  if (unit.isSettled) return 'Settled';
  if (unit.isSold || unit.buyerName) return 'Sold';
  return 'Unsold';
};

const buildUnitPayload = (projectId: string, unit: Unit) => {
  const saleableAreaSqFt = unit.saleableAreaSqFt ?? 0;
  const carpetAreaSqFt = unit.carpetAreaSqFt ?? saleableAreaSqFt;
  const agreedPrice = (saleableAreaSqFt * (unit.ratePerSqFt ?? 0)) + (unit.amenitiesCost ?? 0) + (unit.adjustments ?? 0);
  // unit_code is the human display code scoped by project; the app still uses
  // the unit UUID for routes and transaction foreign keys.
  const unitCode = getUnitCode(unit);

  return cleanPayload({
    project_id: projectId,
    unit_code: unitCode,
    tower: unit.tower,
    flat_no: unit.flatNumber,
    bhk: unit.bhk,
    area_sqft: saleableAreaSqFt,
    carpet_area_sqft: carpetAreaSqFt,
    saleable_area_sqft: saleableAreaSqFt,
    ownership_type: unit.ownershipType,
    status: buildUnitStatus(unit),
    buyer_name: unit.buyerName || null,
    buyer_phone: unit.buyerPhone || null,
    agreed_price: agreedPrice,
    rate_per_sqft: unit.ratePerSqFt ?? 0,
    amenities_cost: unit.amenitiesCost ?? 0,
    adjustments: unit.adjustments ?? 0,
    handover_date: unit.handoverTarget || null,
    is_sold: Boolean(unit.isSold || unit.buyerName),
    is_settled: Boolean(unit.isSettled)
  });
};

const sideToDbType: Record<TransactionSide, string> = {
  [TransactionSide.BuyerReceipt]: 'BuyerReceipt',
  [TransactionSide.VendorInvoice]: 'VendorInvoice',
  [TransactionSide.VendorPayment]: 'VendorPayment',
  [TransactionSide.LandownerReimbursable]: 'LandownerReimbursable',
  [TransactionSide.LandownerReimbursableReceipt]: 'LandownerReimbursableReceipt'
};

const dbTypeToSide: Record<string, TransactionSide> = {
  BuyerReceipt: TransactionSide.BuyerReceipt,
  VendorInvoice: TransactionSide.VendorInvoice,
  VendorPayment: TransactionSide.VendorPayment,
  LandownerReimbursable: TransactionSide.LandownerReimbursable,
  LandownerReimbursableReceipt: TransactionSide.LandownerReimbursableReceipt
};

const toTransaction = (row: any): Transaction => {
  let parsedDetails: { description?: string; workPackage?: string; dueDate?: string } = {};
  if (row.details && typeof row.details === 'object') {
    parsedDetails = row.details;
  } else if (row.details && typeof row.details === 'string') {
    try {
      parsedDetails = JSON.parse(row.details);
    } catch {
      parsedDetails = { description: row.details };
    }
  }

  return {
    id: row.id,
    unitId: row.unit_id || undefined,
    scope: row.scope as TransactionScope,
    side: dbTypeToSide[row.type] ?? (row.side as TransactionSide),
    amount: Number(row.amount ?? 0),
    date: row.date,
    mode: row.mode || undefined,
    vendorName: row.party || undefined,
    workPackage: parsedDetails.workPackage as Transaction['workPackage'] || undefined,
    description: parsedDetails.description || row.description || undefined,
    dueDate: parsedDetails.dueDate || row.due_date || undefined,
    isSettled: (row.status ?? row.isSettled) === 'Completed' || row.is_settled === true
  };
};

const ensureLandownerUnitForReimbursable = (unit: Unit | undefined, side: TransactionSide) => {
  if ([TransactionSide.LandownerReimbursable, TransactionSide.LandownerReimbursableReceipt].includes(side)) {
    if (!unit || unit.ownershipType !== OwnershipType.Landowner) {
      throw new Error('Landowner reimbursable transactions must be tied to a Landowner unit.');
    }
  }
};

const fetchLinkedUnit = async (projectId: string, unitRef: string): Promise<Unit | undefined> => {
  if (isDemoMode) {
    const demoUnit = getDemoUnit(projectId, unitRef);
    return demoUnit ? cloneUnit(demoUnit) : undefined;
  }
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(unitRef);
  // Transaction forms submit UUIDs, but accepting unit_code keeps old bookmarks
  // and legacy calls from failing during the migration window.
  const query = getSupabaseClient()
    .from('units')
    .select('*')
    .eq('project_id', projectId)
    .is('deleted_at', null);

  const { data, error } = isUuid
    ? await query.eq('id', unitRef).maybeSingle()
    : await query.eq('unit_code', unitRef).maybeSingle();

  throwIfDataError(error);
  return data ? toUnit(data) : undefined;
};

const createAuditEntries = async (
  transactionId: string,
  previousRow: any,
  nextPayload: Record<string, any>,
  changeReason: string,
  changedBy: string
) => {
  const fieldMap: Record<string, string> = {
    amount: 'amount',
    scope: 'scope',
    unit_id: 'unit_id',
    type: 'type',
    date: 'date',
    party: 'party'
  };

  const auditRows = Object.entries(fieldMap)
    .filter(([payloadField]) => nextPayload[payloadField] !== undefined && previousRow[payloadField] !== nextPayload[payloadField])
    .map(([payloadField, fieldName]) => ({
      transaction_id: transactionId,
      changed_at: new Date().toISOString(),
      changed_by: changedBy,
      field_name: fieldName,
      old_value: previousRow[payloadField] === null ? null : String(previousRow[payloadField]),
      new_value: nextPayload[payloadField] === null ? null : String(nextPayload[payloadField]),
      change_reason: changeReason
    }));

  if (auditRows.length) {
    const { error } = await getSupabaseClient().from('transaction_audit_log').insert(auditRows);
    throwIfDataError(error);
  }
};

export async function fetchAllProjects(): Promise<Project[]> {
  if (isDemoMode) return demoState.projects.map(cloneProject);

  const { data, error } = await getSupabaseClient()
    .from('projects')
    .select('*')
    .order('created_at', { ascending: true });
  throwIfDataError(error);
  return (data ?? []).map(toProject);
}

export async function fetchProjectStats(projectIds: string[]): Promise<Record<string, ProjectStats>> {
  if (isDemoMode) {
    return Object.fromEntries(projectIds.map(projectId => [
      projectId,
      {
        unitCount: isDemoProject(projectId) ? demoState.units.length : 0,
        lastTransactionDate: isDemoProject(projectId)
          ? demoState.transactions.reduce<string | null>((latest, transaction) => !latest || transaction.date > latest ? transaction.date : latest, null)
          : null
      }
    ]));
  }

  const entries = await Promise.all(projectIds.map(async (projectId) => {
    const [{ count, error: unitError }, { data: lastTransaction, error: transactionError }] = await Promise.all([
      getSupabaseClient()
        .from('units')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .is('deleted_at', null),
      getSupabaseClient()
        .from('transactions')
        .select('date')
        .eq('project_id', projectId)
        .is('deleted_at', null)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle()
    ]);

    throwIfDataError(unitError);
    throwIfDataError(transactionError);

    return [
      projectId,
      {
        unitCount: count ?? 0,
        lastTransactionDate: lastTransaction?.date ?? null
      }
    ] as const;
  }));

  return Object.fromEntries(entries);
}

export async function createProject(input: NewProjectInput): Promise<Project> {
  const payload = validateProjectInput(input);
  if (isDemoMode) {
    const project: Project = {
      id: buildDemoId('demo-project'),
      code: payload.code,
      name: payload.name,
      location: payload.location,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    demoState.projects.push(project);
    return cloneProject(project);
  }

  const { data, error } = await getSupabaseClient()
    .from('projects')
    .insert(payload)
    .select('*')
    .single();
  if (error) throwProjectCodeError(error);
  if (!data) throw new Error('Failed to create project.');
  return toProject(data);
}

export async function updateProject(id: string, input: Pick<NewProjectInput, 'name' | 'location'>): Promise<Project> {
  const name = input.name.trim();
  if (!name) throw new Error('Project name is required.');
  if (isDemoMode) {
    const project = demoState.projects.find(candidate => candidate.id === id);
    if (!project) throw new Error('Demo project was not found.');
    project.name = name;
    project.location = input.location?.trim() || null;
    project.updatedAt = new Date().toISOString();
    return cloneProject(project);
  }

  const { data, error } = await getSupabaseClient()
    .from('projects')
    .update({ name, location: input.location?.trim() || null })
    .eq('id', id)
    .select('*')
    .single();
  throwIfDataError(error);
  if (!data) throw new Error('Failed to update project.');
  return toProject(data);
}

export async function fetchUnits(projectId: string): Promise<Unit[]> {
  if (isDemoMode) {
    ensureDemoProject(projectId);
    return demoState.units.map(cloneUnit).sort((a, b) => `${a.tower}${a.flatNumber}`.localeCompare(`${b.tower}${b.flatNumber}`));
  }

  const { data, error } = await getSupabaseClient()
    .from('units')
    .select('*')
    .eq('project_id', projectId)
    .is('deleted_at', null)
    .order('tower', { ascending: true })
    .order('flat_no', { ascending: true });
  throwIfDataError(error);
  return (data ?? []).map(toUnit);
}

export async function fetchTransactions(projectId: string): Promise<Transaction[]> {
  if (isDemoMode) {
    ensureDemoProject(projectId);
    return demoState.transactions.map(cloneTransaction).sort((a, b) => a.date.localeCompare(b.date));
  }

  const { data, error } = await getSupabaseClient()
    .from('transactions')
    .select('*')
    .eq('project_id', projectId)
    .is('deleted_at', null)
    .order('date', { ascending: true })
    .order('created_at', { ascending: true });
  throwIfDataError(error);
  return (data ?? []).map(toTransaction);
}

export async function createOrUpdateUnit(projectId: string, unit: Unit): Promise<Unit> {
  const payload = buildUnitPayload(projectId, unit);
  if (isDemoMode) {
    ensureDemoProject(projectId);
    const nextUnit: Unit = {
      ...unit,
      id: unit.id || buildDemoId('demo-unit'),
      agreedPrice: payload.agreed_price
    };
    const existingIndex = demoState.units.findIndex(candidate => candidate.id === nextUnit.id);
    if (existingIndex >= 0) demoState.units[existingIndex] = nextUnit;
    else demoState.units.push(nextUnit);
    return cloneUnit(nextUnit);
  }

  if (unit.id) {
    const { data, error } = await getSupabaseClient()
      .from('units')
      .update(payload)
      .eq('project_id', projectId)
      .eq('id', unit.id)
      .select('*')
      .single();
    if (error) throwUnitCodeError(error);
    if (!data) throw new Error('Failed to update unit');
    return toUnit(data);
  }
  const { data, error } = await getSupabaseClient().from('units').insert(payload).select('*').single();
  if (error) throwUnitCodeError(error);
  if (!data) throw new Error('Failed to create unit');
  return toUnit(data);
}

export async function createUnit(projectId: string, payload: NewUnitInput): Promise<Unit> { return createOrUpdateUnit(projectId, payload); }
export async function updateUnit(projectId: string, payload: Unit): Promise<Unit> {
  if (!payload.id) throw new Error('Unit id is required for update');
  return createOrUpdateUnit(projectId, payload);
}

export async function deleteUnit(projectId: string, id: string, deleteReason: string, deletedBy: string = SYSTEM_USER): Promise<void> {
  if (isDemoMode) {
    ensureDemoProject(projectId);
    demoState.units = demoState.units.filter(unit => unit.id !== id);
    demoState.transactions = demoState.transactions.filter(transaction => transaction.unitId !== id);
    return;
  }

  const { error } = await getSupabaseClient()
    .from('units')
    .update({ deleted_at: new Date().toISOString(), deleted_by: deletedBy, delete_reason: deleteReason || 'Soft delete' })
    .eq('project_id', projectId)
    .eq('id', id);
  throwIfDataError(error);
}

export async function createTransaction(projectId: string, payload: NewTransactionInput): Promise<Transaction> {
  const resolvedScope = payload.side === TransactionSide.BuyerReceipt
    ? TransactionScope.PerUnit
    : payload.scope ?? TransactionScope.ProjectWide;

  if (payload.amount < 0) throw new Error('Amount must be a non-negative number.');

  assertPerUnitRequiresUnit(resolvedScope, payload.unitId);
  // Resolve a single unit in the active project instead of fetching every unit;
  // this keeps project isolation and avoids the old N+1-style lookup.
  const linkedUnit = resolvedScope === TransactionScope.PerUnit && payload.unitId
    ? await fetchLinkedUnit(projectId, payload.unitId)
    : undefined;
  if (resolvedScope === TransactionScope.PerUnit && !linkedUnit) {
    throw new Error('Selected unit was not found in this project.');
  }
  ensureLandownerUnitForReimbursable(linkedUnit, payload.side);
  if (isDemoMode) {
    const transaction: Transaction = {
      ...payload,
      id: buildDemoId('demo-tx'),
      scope: resolvedScope,
      unitId: resolvedScope === TransactionScope.PerUnit ? linkedUnit?.id : undefined
    };
    demoState.transactions.push(transaction);
    return cloneTransaction(transaction);
  }

  const insertPayload = cleanPayload({
    project_id: projectId,
    unit_id: resolvedScope === TransactionScope.PerUnit ? linkedUnit?.id ?? null : null,
    type: sideToDbType[payload.side],
    scope: resolvedScope,
    date: payload.date,
    amount: payload.amount,
    party: payload.vendorName || null,
    details: JSON.stringify({ description: payload.description, workPackage: payload.workPackage, dueDate: payload.dueDate }),
    mode: payload.mode || null,
    status: payload.isSettled ? 'Completed' : 'Pending'
  });

  const { data, error } = await getSupabaseClient().from('transactions').insert(insertPayload).select('*').single();
  throwIfDataError(error);
  if (!data) throw new Error('Failed to create transaction');
  return toTransaction(data);
}

export async function updateTransaction(
  projectId: string,
  id: string,
  payload: Partial<NewTransactionInput>,
  changedBy: string = SYSTEM_USER,
  changeReason: string = 'Manual financial edit'
): Promise<Transaction> {
  if (isDemoMode) {
    ensureDemoProject(projectId);
    const existingIndex = demoState.transactions.findIndex(transaction => transaction.id === id);
    if (existingIndex < 0) throw new Error('Demo transaction not found.');
    const existing = demoState.transactions[existingIndex];
    const incomingSide = payload.side ?? existing.side;
    const incomingScope = incomingSide === TransactionSide.BuyerReceipt
      ? TransactionScope.PerUnit
      : payload.scope ?? existing.scope ?? TransactionScope.ProjectWide;
    if (payload.amount !== undefined && payload.amount < 0) throw new Error('Amount must be a non-negative number.');
    const incomingUnitId = incomingScope === TransactionScope.ProjectWide
      ? undefined
      : payload.unitId === undefined
        ? existing.unitId
        : payload.unitId;
    assertPerUnitRequiresUnit(incomingScope, incomingUnitId);
    const linkedUnit = incomingScope === TransactionScope.PerUnit && incomingUnitId
      ? getDemoUnit(projectId, incomingUnitId)
      : undefined;
    if (incomingScope === TransactionScope.PerUnit && !linkedUnit) throw new Error('Selected unit was not found in this project.');
    ensureLandownerUnitForReimbursable(linkedUnit, incomingSide);

    const nextTransaction: Transaction = {
      ...existing,
      ...payload,
      side: incomingSide,
      scope: incomingScope,
      unitId: incomingScope === TransactionScope.PerUnit ? linkedUnit?.id : undefined
    };
    demoState.transactions[existingIndex] = nextTransaction;
    return cloneTransaction(nextTransaction);
  }

  const { data: existing, error: fetchError } = await getSupabaseClient()
    .from('transactions')
    .select('*')
    .eq('project_id', projectId)
    .eq('id', id)
    .single();
  throwIfDataError(fetchError);
  if (!existing) throw new Error('Transaction not found');

  const incomingSide = payload.side ?? dbTypeToSide[existing.type] ?? existing.side;
  const incomingScope = incomingSide === TransactionSide.BuyerReceipt
    ? TransactionScope.PerUnit
    : payload.scope ?? existing.scope;
  if (payload.amount !== undefined && payload.amount < 0) throw new Error('Amount must be a non-negative number.');
  // If the caller did not change the unit, keep the existing DB foreign key.
  // If scope changed to project-wide, intentionally clear the unit reference.
  const incomingUnitId = incomingScope === TransactionScope.ProjectWide
    ? null
    : payload.unitId === undefined
      ? existing.unit_id
      : payload.unitId;

  assertPerUnitRequiresUnit(incomingScope, incomingUnitId ?? undefined);
  const linkedUnit = incomingScope === TransactionScope.PerUnit && incomingUnitId
    ? await fetchLinkedUnit(projectId, incomingUnitId)
    : undefined;
  if (incomingScope === TransactionScope.PerUnit && !linkedUnit) {
    throw new Error('Selected unit was not found in this project.');
  }
  ensureLandownerUnitForReimbursable(linkedUnit, incomingSide);

  const updatePayload = cleanPayload({
    unit_id: incomingScope === TransactionScope.ProjectWide ? null : linkedUnit?.id,
    type: payload.side ? sideToDbType[payload.side] : undefined,
    scope: incomingScope === existing.scope && payload.scope === undefined ? undefined : incomingScope,
    date: payload.date,
    amount: payload.amount,
    party: payload.vendorName,
    details: payload.description || payload.workPackage || payload.dueDate
      ? JSON.stringify({ description: payload.description, workPackage: payload.workPackage, dueDate: payload.dueDate })
      : undefined,
    mode: payload.mode,
    status: payload.isSettled === undefined ? undefined : payload.isSettled ? 'Completed' : 'Pending'
  });

  await createAuditEntries(id, existing, updatePayload, changeReason, changedBy);

  const { data, error } = await getSupabaseClient()
    .from('transactions')
    .update(updatePayload)
    .eq('project_id', projectId)
    .eq('id', id)
    .select('*')
    .single();
  throwIfDataError(error);
  if (!data) throw new Error('Failed to update transaction');
  return toTransaction(data);
}

export async function deleteTransaction(projectId: string, id: string, deleteReason: string, deletedBy: string = SYSTEM_USER): Promise<void> {
  if (isDemoMode) {
    ensureDemoProject(projectId);
    demoState.transactions = demoState.transactions.filter(transaction => transaction.id !== id);
    return;
  }

  const { error } = await getSupabaseClient()
    .from('transactions')
    .update({ deleted_at: new Date().toISOString(), deleted_by: deletedBy, delete_reason: deleteReason || 'Soft delete' })
    .eq('project_id', projectId)
    .eq('id', id);
  throwIfDataError(error);
}
