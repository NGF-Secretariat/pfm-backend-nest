-- Rename `state_id` to `stateId` to match Prisma field naming
ALTER TABLE IF EXISTS performance_indicators RENAME COLUMN state_id TO "stateId";

-- Ensure foreign key exists (drop any existing fk on stateId then add)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = 'performance_indicators' AND tc.constraint_type = 'FOREIGN KEY' AND kcu.column_name = 'stateId'
  ) THEN
    -- fk already exists
    RAISE NOTICE 'FK on performance_indicators(stateId) exists';
  ELSE
    BEGIN
      ALTER TABLE performance_indicators ADD CONSTRAINT performance_indicators_stateId_fkey FOREIGN KEY ("stateId") REFERENCES states(id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN
      -- ignore
      NULL;
    END;
  END IF;
END$$;

-- Recreate unique constraint on (stateId, year)
ALTER TABLE performance_indicators DROP CONSTRAINT IF EXISTS performance_indicators_state_year_unique;
ALTER TABLE performance_indicators ADD CONSTRAINT performance_indicators_state_year_unique UNIQUE ("stateId", year);

-- Add index on year if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'performance_indicators_year_idx') THEN
    CREATE INDEX performance_indicators_year_idx ON performance_indicators (year);
  END IF;
END$$;
