import { TransactionScope } from './types';

// Mirrors the SQL transactions_scope_unit_check constraint before hitting Supabase.
export const assertPerUnitRequiresUnit = (scope: TransactionScope, unitId?: string) => {
  if (scope === TransactionScope.PerUnit && !unitId) {
    throw new Error('PerUnit transaction requires unit_id.');
  }
};
