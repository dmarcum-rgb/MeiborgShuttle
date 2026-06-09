
CREATE TABLE public.system_errors (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now() NOT NULL,
  error_type text NOT NULL DEFAULT 'auto',
  source text,
  message text NOT NULL,
  context jsonb DEFAULT '{}',
  reporter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reporter_name text,
  resolved boolean DEFAULT false NOT NULL,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_by_name text
);

ALTER TABLE public.system_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_insert_errors" ON public.system_errors
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "select_system_errors" ON public.system_errors
  FOR SELECT TO authenticated USING (
    reporter_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'office')
  );

CREATE POLICY "office_update_errors" ON public.system_errors
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'office'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'office'));
