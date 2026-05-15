-- Keep direct database writes aligned with the app's non-negative amount validation.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transactions_amount_nonnegative'
      AND conrelid = 'transactions'::regclass
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_amount_nonnegative CHECK (amount >= 0);
  END IF;
END $$;
