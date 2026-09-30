ALTER TABLE public.symptom_logs
  ADD COLUMN IF NOT EXISTS impact_areas text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS outside_period boolean;

ALTER TABLE public.symptom_logs
DROP CONSTRAINT IF EXISTS symptom_logs_impact_check;

ALTER TABLE public.symptom_logs
ADD CONSTRAINT symptom_logs_impact_check CHECK (
    impact IN (
        'none',
        'mild',
        'moderate',
        'significant',
        'unable',
        'some',
        'missed_activity'
    )
);

ALTER TABLE public.symptom_logs
  ALTER COLUMN impact_areas SET DEFAULT '{}'::text[];