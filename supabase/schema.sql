-- Sincronización en la nube (opcional) para Ana ERP.
-- 1. Crea un proyecto en Supabase y ejecuta este script en el SQL Editor.
-- 2. En Authentication > Users crea el usuario (correo y contraseña) de quien usará el sistema.
-- 3. En Vercel agrega VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY y vuelve a desplegar.

create table if not exists public.erp_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.erp_state enable row level security;

create policy "usuarios autenticados leen" on public.erp_state
  for select to authenticated using (true);
create policy "usuarios autenticados insertan" on public.erp_state
  for insert to authenticated with check (true);
create policy "usuarios autenticados actualizan" on public.erp_state
  for update to authenticated using (true) with check (true);
