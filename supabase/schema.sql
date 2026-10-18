-- Sincronización en la nube para Ana ERP.
-- Ejecuta este script en el SQL Editor de un proyecto de Supabase y luego
-- agrega a erp_users el correo de cada persona autorizada.

create table if not exists public.erp_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- Correos autorizados para usar el ERP. Cualquier otra cuenta no ve ni modifica nada.
create table if not exists public.erp_users (
  email text primary key,
  created_at timestamptz not null default now()
);

create or replace function public.is_erp_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.erp_users u
    where lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke execute on function public.is_erp_user() from public, anon;
grant execute on function public.is_erp_user() to authenticated;

alter table public.erp_state enable row level security;
alter table public.erp_users enable row level security;

drop policy if exists "erp_state_select" on public.erp_state;
drop policy if exists "erp_state_insert" on public.erp_state;
drop policy if exists "erp_state_update" on public.erp_state;
create policy "erp_state_select" on public.erp_state for select to authenticated using ((select public.is_erp_user()));
create policy "erp_state_insert" on public.erp_state for insert to authenticated with check ((select public.is_erp_user()));
create policy "erp_state_update" on public.erp_state for update to authenticated
  using ((select public.is_erp_user())) with check ((select public.is_erp_user()));

drop policy if exists "erp_users_select" on public.erp_users;
drop policy if exists "erp_users_insert" on public.erp_users;
drop policy if exists "erp_users_delete" on public.erp_users;
create policy "erp_users_select" on public.erp_users for select to authenticated using ((select public.is_erp_user()));
create policy "erp_users_insert" on public.erp_users for insert to authenticated with check ((select public.is_erp_user()));
create policy "erp_users_delete" on public.erp_users for delete to authenticated using ((select public.is_erp_user()));

-- Keeps the allowlist in step when a user changes their e-mail address.
create or replace function public.sync_erp_user_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email and old.email is not null and new.email is not null then
    update public.erp_users set email = lower(new.email) where lower(email) = lower(old.email);
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_email_change on auth.users;
create trigger on_auth_email_change
  after update of email on auth.users
  for each row execute function public.sync_erp_user_email();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'erp_state'
  ) then
    alter publication supabase_realtime add table public.erp_state;
  end if;
end $$;
