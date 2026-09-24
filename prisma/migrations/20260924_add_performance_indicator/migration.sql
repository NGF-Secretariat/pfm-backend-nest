-- Migration: add performance_indicators table

CREATE TABLE IF NOT EXISTS performance_indicators (
  id serial PRIMARY KEY,
  state_id integer NOT NULL REFERENCES states(id) ON DELETE CASCADE,
  year integer NOT NULL,
  data jsonb NOT NULL,
  CONSTRAINT performance_indicators_state_year_unique UNIQUE (state_id, year)
);

CREATE INDEX IF NOT EXISTS performance_indicators_year_idx ON performance_indicators (year);
