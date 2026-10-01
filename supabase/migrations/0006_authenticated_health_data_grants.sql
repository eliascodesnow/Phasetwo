REVOKE ALL ON TABLE public.symptom_logs, public.user_consents FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.symptom_logs
  TO authenticated;

GRANT SELECT, INSERT, UPDATE
  ON TABLE public.user_consents
  TO authenticated;

NOTIFY pgrst, 'reload schema';