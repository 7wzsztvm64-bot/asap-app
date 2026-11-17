-- =============================================================================
-- asap – Einladungscodes für die Beta (Issue #22)
--   * moderation.config.invite_required schaltet die Pflicht ein (Produktion: an,
--     Testprojekt: aus). Codes legt Noah im Dashboard an: moderation.invite_codes.
--   * Die App schickt den Code bei der Registrierung mit (signUp → options.data.invite_code).
--     Ein Trigger auf auth.users prüft ihn, zählt die Nutzung hoch und entfernt ihn
--     wieder aus den Metadaten (Datensparsamkeit: kein Bezug Person ↔ Code).
--   * check_invite_code() erlaubt der App eine freundliche Fehlermeldung vorab;
--     entscheidend ist allein der Trigger.
-- =============================================================================

create table moderation.config (
  id              boolean primary key default true check (id),  -- genau eine Zeile
  invite_required boolean not null default false
);
insert into moderation.config default values;

create table moderation.invite_codes (
  code       text primary key check (code ~ '^[A-Z0-9-]{6,40}$'),
  note       text,                                  -- z. B. „Uni-Freundeskreis“
  max_uses   integer not null default 1 check (max_uses > 0),
  uses       integer not null default 0 check (uses >= 0),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table moderation.config enable row level security;
alter table moderation.invite_codes enable row level security;

-- Codes ohne Rücksicht auf Groß-/Kleinschreibung und Leerzeichen
create or replace function private.normalize_invite_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(btrim(coalesce(p_code, '')));
$$;

-- ---------- Für die App (auch vor dem Login) ----------
create or replace function public.invite_required()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select invite_required from moderation.config;
$$;

create or replace function public.check_invite_code(p_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from moderation.invite_codes
    where code = private.normalize_invite_code(p_code)
      and uses < max_uses
      and (expires_at is null or expires_at > now())
  );
$$;

revoke all on function public.invite_required() from public;
revoke all on function public.check_invite_code(text) from public;
grant execute on function public.invite_required() to anon, authenticated;
grant execute on function public.check_invite_code(text) to anon, authenticated;

-- ---------- Prüfung bei der Registrierung ----------
create or replace function private.check_invite_on_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select invite_required from moderation.config) then
    update moderation.invite_codes
    set uses = uses + 1
    where code = private.normalize_invite_code(new.raw_user_meta_data ->> 'invite_code')
      and uses < max_uses
      and (expires_at is null or expires_at > now());
    if not found then
      raise exception using errcode = 'P0001', message = 'INVITE_INVALID';
    end if;
  end if;
  new.raw_user_meta_data := coalesce(new.raw_user_meta_data, '{}'::jsonb) - 'invite_code';
  return new;
end;
$$;

revoke all on function private.check_invite_on_signup() from public;

create trigger before_auth_user_created_invite
  before insert on auth.users
  for each row execute function private.check_invite_on_signup();
