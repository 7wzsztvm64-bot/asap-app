-- =============================================================================
-- asap – Registrierung & Onboarding (Issues #4 und #5)
--   * Profil wird bei der Registrierung automatisch angelegt (Trigger auf auth.users)
--   * Profil-Prüfungen laufen auch serverseitig (u. a. 18+)
--   * completeOnboarding() als Funktion – nur sie darf profile_complete setzen
--
-- Fehler werfen wir mit errcode P0001 und einem festen Code als message
-- (z. B. 'UNDERAGE'). Der DataService übersetzt den Code in einen Text (t('errors.…')),
-- detail nennt bei Validierungsfehlern die betroffenen Felder (kommagetrennt).
-- =============================================================================

-- ---------- Profil bei Registrierung anlegen ----------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------- Profil-Prüfungen (bei jedem Insert/Update) ----------
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
  -- Ein vollständiges Profil darf nicht nachträglich wieder unvollständig werden
  if new.profile_complete and (new.name = '' or new.birthdate is null or new.gender is null
      or cardinality(new.interested_in) = 0 or new.city = '' or jsonb_array_length(new.photos) = 0) then
    raise exception using errcode = 'P0001', message = 'PROFILE_INCOMPLETE';
  end if;
  return new;
end;
$$;

create trigger profiles_validate
  before insert or update on public.profiles
  for each row execute function private.validate_profile();

-- ---------- Onboarding abschließen ----------
create or replace function public.complete_onboarding()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.profiles;
  missing text[] := '{}';
begin
  select * into p from public.profiles where id = (select auth.uid());
  if not found then
    raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
  end if;
  if p.name = '' then missing := array_append(missing, 'name'); end if;
  if p.birthdate is null then missing := array_append(missing, 'birthdate'); end if;
  if p.gender is null then missing := array_append(missing, 'gender'); end if;
  if cardinality(p.interested_in) = 0 then missing := array_append(missing, 'interestedIn'); end if;
  if p.city = '' then missing := array_append(missing, 'city'); end if;
  if cardinality(p.interests) < 3 then missing := array_append(missing, 'interests'); end if;
  if jsonb_array_length(p.photos) = 0 then missing := array_append(missing, 'photos'); end if;
  if cardinality(missing) > 0 then
    raise exception using errcode = 'P0001', message = 'PROFILE_INCOMPLETE', detail = array_to_string(missing, ',');
  end if;
  -- 18+ prüft zusätzlich der Trigger validate_profile
  update public.profiles set profile_complete = true, onboarding_step = 99 where id = p.id;
end;
$$;

revoke all on function public.complete_onboarding() from public, anon;
grant execute on function public.complete_onboarding() to authenticated;
