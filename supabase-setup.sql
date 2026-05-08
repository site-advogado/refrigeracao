-- ============================================================
-- supabase-setup.sql
-- Execute no SQL Editor do Supabase (painel > SQL Editor)
-- ============================================================

-- 1. LOGS DE AUTENTICAÇÃO
CREATE TABLE IF NOT EXISTS public.auth_logs (
  id             BIGSERIAL PRIMARY KEY,
  email          TEXT,
  ip_address     INET NOT NULL,
  success        BOOLEAN NOT NULL DEFAULT false,
  failure_reason TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_logs_ip    ON public.auth_logs (ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_logs_email ON public.auth_logs (email,      created_at DESC);
ALTER TABLE public.auth_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only_auth_logs"
  ON public.auth_logs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 2. PERFIS DE USUÁRIO
CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  TEXT,
  role       TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin','technician','viewer')),
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_profile"   ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_update_own_profile" ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = (SELECT role FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "admins_read_all_profiles" ON public.profiles FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. EQUIPAMENTOS
CREATE TABLE IF NOT EXISTS public.equipamentos (
  id           BIGSERIAL PRIMARY KEY,
  owner_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome         TEXT NOT NULL,
  modelo       TEXT,
  numero_serie TEXT,
  localizacao  TEXT,
  ativo        BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.equipamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "technicians_read_equipamentos" ON public.equipamentos FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','technician')));
CREATE POLICY "owners_manage_equipamentos" ON public.equipamentos FOR ALL
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- 4. DESABILITAR SIGNUP PÚBLICO
-- Execute APÓS criar o primeiro usuário admin no Dashboard
UPDATE auth.config SET enable_signup = false WHERE TRUE;

-- 5. VIEW DE IPs SUSPEITOS
CREATE OR REPLACE VIEW public.suspicious_ips AS
SELECT
  ip_address,
  COUNT(*) AS failed_attempts,
  MAX(created_at) AS last_attempt,
  array_agg(DISTINCT email) FILTER (WHERE email IS NOT NULL) AS emails_tried
FROM public.auth_logs
WHERE success = false AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY ip_address
HAVING COUNT(*) >= 10
ORDER BY failed_attempts DESC;
