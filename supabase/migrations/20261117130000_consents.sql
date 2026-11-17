-- =============================================================================
-- asap – Zustimmung & Einwilligung (Issue #23)
--   * Registrierung nur mit Zustimmung zu Nutzungsregeln/Datenschutzerklärung:
--     die App schickt terms_version mit (signUp → options.data), ein Trigger auf
--     auth.users verlangt sie, das Profil merkt sich Version und Zeitpunkt.
--   * „Interessiert an“ (sexuelle Orientierung, Art. 9 DSGVO) nur mit ausdrücklicher
--     Einwilligung: give_sensitive_consent() setzt den Zeitpunkt, ohne ihn lehnt
--     validate_profile() jede Änderung von interested_in ab.
--   * Widerruf (Art. 7 Abs. 3): withdraw_sensitive_consent() löscht die Angabe und
--     nimmt das Profil aus der App, bis es neu ausgefüllt wird.
-- =============================================================================

alter table public.profiles
  add column terms_version        text check (char_length(terms_version) <= 40),
  add column terms_accepted_at    timestamptz,
  add column sensitive_consent_at timestamptz;

-- ---------- Registrierung: Zustimmung ist Pflicht ----------
create or replace function private.check_terms_on_signup()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'terms_version', '') = '' then
    raise exception using errcode = 'P0001', message = 'TERMS_REQUIRED';
  end if;
  return new;
end;
$$;

revoke all on function private.check_terms_on_signup() from public;

create trigger before_auth_user_created_terms
  before insert on auth.users
  for each row execute function private.check_terms_on_signup();

-- Profil mit Zustimmung anlegen
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, terms_version, terms_accepted_at)
  values (new.id, left(new.raw_user_meta_data ->> 'terms_version', 40), now());
  return new;
end;
$$;

-- ---------- Profil-Prüfungen: wie bisher + Einwilligung für „Interessiert an“ ----------
create or replace function private.validate_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.birthdate is not null and new.birthdate > (current_date - interval '18 years')::date then
    raise exception using errcode = 'P0001', message = 'UNDERAGE', detail = 'birthdate';
  end if;
  if new.birthdate is not null and new.birthdate < (current_date - interval '100 years')::date then
    raise exception using errcode = 'P0001', message = 'VALIDATION', detail = 'birthdate';
  end if;
  if exists (select 1 from unnest(new.interests) as tag where char_length(tag) not between 1 and 30) then
    raise exception using errcode = 'P0001', message = 'VALIDATION', detail = 'interests';
  end if;
  -- Foto-Platzhalter sind kleine JSON-Objekte; schützt vor beliebig großen Datenmengen
  if pg_column_size(new.photos) > 4000 then
    raise exception using errcode = 'P0001', message = 'VALIDATION', detail = 'photos';
  end if;
  -- „Interessiert an“ nur mit ausdrücklicher Einwilligung speichern (Art. 9 DSGVO)
  if cardinality(new.interested_in) > 0 and new.sensitive_consent_at is null
     and (tg_op = 'INSERT' or new.interested_in is distinct from old.interested_in) then
    raise exception using errcode = 'P0001', message = 'CONSENT_REQUIRED', detail = 'interestedIn';
  end if;
  -- Ein vollständiges Profil darf nicht nachträglich wieder unvollständig werden
  if new.profile_complete and (new.name = '' or new.birthdate is null or new.gender is null
      or cardinality(new.interested_in) = 0 or new.city = '' or jsonb_array_length(new.photos) = 0) then
    raise exception using errcode = 'P0001', message = 'PROFILE_INCOMPLETE';
  end if;
  return new;
end;
$$;

-- ---------- Einwilligung geben und widerrufen ----------
create or replace function public.give_sensitive_consent()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
  end if;
  update public.profiles set sensitive_consent_at = now()
  where id = (select auth.uid()) and sensitive_consent_at is null;
end;
$$;

-- Löscht „Interessiert an“; das Profil ist danach für andere unsichtbar (unvollständig),
-- bis die Person im Onboarding neu einwilligt.
create or replace function public.withdraw_sensitive_consent()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
  end if;
  update public.profiles
  set interested_in = '{}', sensitive_consent_at = null, profile_complete = false, onboarding_step = least(onboarding_step, 2)
  where id = (select auth.uid());
end;
$$;

revoke all on function public.give_sensitive_consent() from public, anon;
revoke all on function public.withdraw_sensitive_consent() from public, anon;
grant execute on function public.give_sensitive_consent() to authenticated;
grant execute on function public.withdraw_sensitive_consent() to authenticated;
