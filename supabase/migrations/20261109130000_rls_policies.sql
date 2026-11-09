-- =============================================================================
-- asap – Row Level Security (Issue #3)
-- Anwenden wie die erste Migration: SQL Editor → Inhalt einfügen → Run.
-- Test: `npm run test:db` (prüft diese Regeln automatisch, siehe supabase/tests/).
--
-- Grundsätze:
--   1. Alle Policies gelten nur für eingeloggte Personen (Rolle `authenticated`).
--      Ohne Login (`anon`) ist alles gesperrt.
--   2. Lesen und einfache Inserts regelt RLS direkt.
--   3. Zustandswechsel (Like annehmen → Match, Termin bestätigen, „gelesen“)
--      haben hier bewusst KEINE Policy. Sie laufen später über Datenbank-
--      Funktionen, die alle Regeln in einem Schritt prüfen (Issues #7–#9).
--   4. Fremde Profile gibt es nur über get_public_profiles() – mit Alter statt
--      Geburtsdatum und ohne „Interessiert an“ (sensibles Datum).
-- =============================================================================

-- ---------- Hilfsfunktionen in einem nicht öffentlichen Schema ----------
-- Das Schema `private` ist nicht über die API erreichbar. Die Funktionen können
-- also in Policies benutzt, aber nicht von außen aufgerufen werden.
create schema if not exists private;
grant usage on schema private to authenticated;

-- Gibt es eine Blockierung zwischen a und b (egal in welche Richtung)?
-- security definer, weil die blockierte Person die Zeile in `blocks` selbst nicht lesen darf.
create or replace function private.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

-- Ist die eingeloggte Person an diesem Match beteiligt?
create or replace function private.is_match_member(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.matches
    where id = p_match_id and (select auth.uid()) in (user1_id, user2_id)
  );
$$;

revoke all on function private.is_blocked_between(uuid, uuid) from public;
revoke all on function private.is_match_member(uuid) from public;
grant execute on function private.is_blocked_between(uuid, uuid) to authenticated;
grant execute on function private.is_match_member(uuid) to authenticated;

-- ---------- profiles ----------
-- Direkt lesbar ist nur das eigene Profil (inkl. Geburtsdatum, „Interessiert an“).
create policy "profiles: eigenes Profil lesen"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles: eigenes Profil ändern"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Nur diese Spalten dürfen selbst geändert werden. profile_complete setzt später
-- completeOnboarding() nach der serverseitigen 18+-Prüfung (Issue #5).
-- Das Profil selbst legt ein Trigger bei der Registrierung an (Issue #4).
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (name, birthdate, gender, interested_in, city, bio, interests, photos, onboarding_step)
  on public.profiles to authenticated;

-- Öffentliche Profilfelder anderer Personen. Nur vollständige Profile, keine
-- blockierten Personen. Alter statt Geburtsdatum, ohne „Interessiert an“.
create or replace function public.get_public_profiles(ids uuid[])
returns table (
  id uuid,
  name text,
  age integer,
  gender text,
  city text,
  bio text,
  photos jsonb,
  interests text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name, extract(year from age(p.birthdate))::integer, p.gender, p.city, p.bio, p.photos, p.interests
  from public.profiles p
  where p.id = any (ids)
    and (select auth.uid()) is not null
    and (p.id = (select auth.uid())
         or (p.profile_complete and not private.is_blocked_between(p.id, (select auth.uid()))));
$$;

revoke all on function public.get_public_profiles(uuid[]) from public, anon;
grant execute on function public.get_public_profiles(uuid[]) to authenticated;

-- ---------- ideas ----------
-- Lesbar: eigene Ideen; aktive Ideen anderer (ohne Blockierung); außerdem die
-- Idee eines eigenen Matches – auch wenn sie inzwischen pausiert oder gelöscht ist,
-- damit der Chat seine Idee behält. (Gesendete Likes auf gelöschte Ideen liefert
-- getSentLikes() in Issue #7.)
create policy "ideas: lesen"
  on public.ideas for select to authenticated
  using (
    owner_id = (select auth.uid())
    or (active and deleted_at is null and not private.is_blocked_between(owner_id, (select auth.uid())))
    or exists (select 1 from public.matches m
               where m.idea_id = ideas.id and (select auth.uid()) in (m.user1_id, m.user2_id))
  );

create policy "ideas: eigene anlegen"
  on public.ideas for insert to authenticated
  with check (owner_id = (select auth.uid()) and deleted_at is null);

-- Gelöschte Ideen (deleted_at gesetzt) lassen sich nicht mehr ändern.
create policy "ideas: eigene ändern"
  on public.ideas for update to authenticated
  using (owner_id = (select auth.uid()) and deleted_at is null)
  with check (owner_id = (select auth.uid()));

-- Kein DELETE: Ideen werden nur weich gelöscht (deleted_at).
revoke delete on public.ideas from anon, authenticated;

-- ---------- likes ----------
-- Direkt lesen darf nur die angefragte Person. Die likende Person bekommt ihre
-- gesendeten Likes über getSentLikes() (Issue #7), das „declined“ als „offen“
-- ausgibt – sonst wäre eine Ablehnung über die API sichtbar.
create policy "likes: erhaltene lesen"
  on public.likes for select to authenticated
  using (to_user_id = (select auth.uid()));

create policy "likes: liken"
  on public.likes for insert to authenticated
  with check (
    from_user_id = (select auth.uid())
    and status = 'pending'
    and merged_into_match_id is null
    and responded_at is null
    and exists (select 1 from public.ideas i
                where i.id = idea_id and i.owner_id = to_user_id
                  and i.active and i.deleted_at is null)
    and not private.is_blocked_between(from_user_id, to_user_id)
  );

-- Annehmen/Ablehnen erzeugt ggf. ein Match → nur über Funktion (Issue #7).
revoke update, delete on public.likes from anon, authenticated;

-- ---------- matches ----------
-- Nur Beteiligte lesen. Anlegen und „gesehen“ nur über Funktionen (#7, #8).
create policy "matches: eigene lesen"
  on public.matches for select to authenticated
  using ((select auth.uid()) in (user1_id, user2_id));

revoke insert, update, delete on public.matches from anon, authenticated;

-- ---------- messages ----------
create policy "messages: im eigenen Match lesen"
  on public.messages for select to authenticated
  using (private.is_match_member(match_id));

create policy "messages: im eigenen Match schreiben"
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and private.is_match_member(match_id)
    and not from_like
    and read_at is null
  );

-- „Gelesen“ setzt markAsRead() (Issue #8).
revoke update, delete on public.messages from anon, authenticated;

-- ---------- proposals ----------
create policy "proposals: im eigenen Match lesen"
  on public.proposals for select to authenticated
  using (private.is_match_member(match_id));

create policy "proposals: vorschlagen"
  on public.proposals for insert to authenticated
  with check (
    proposed_by = (select auth.uid())
    and private.is_match_member(match_id)
    and status = 'proposed'
    and responded_at is null
    and date_time > now() + interval '10 minutes'
    and date_time < now() + interval '1 year'
  );

-- Bestätigen/Ablehnen über respondToProposal() (Issue #9).
revoke update, delete on public.proposals from anon, authenticated;

-- ---------- passes ----------
create policy "passes: eigene lesen"
  on public.passes for select to authenticated
  using (user_id = (select auth.uid()));

create policy "passes: eigene anlegen"
  on public.passes for insert to authenticated
  with check (user_id = (select auth.uid()));

-- „Übersprungene zurücksetzen“
create policy "passes: eigene löschen"
  on public.passes for delete to authenticated
  using (user_id = (select auth.uid()));

revoke update on public.passes from anon, authenticated;

-- ---------- blocks ----------
-- Die blockierte Person sieht NICHT, dass sie blockiert wurde.
create policy "blocks: eigene lesen"
  on public.blocks for select to authenticated
  using (blocker_id = (select auth.uid()));

create policy "blocks: blockieren"
  on public.blocks for insert to authenticated
  with check (blocker_id = (select auth.uid()));

create policy "blocks: Blockierung aufheben"
  on public.blocks for delete to authenticated
  using (blocker_id = (select auth.uid()));

revoke update on public.blocks from anon, authenticated;

-- ---------- reports ----------
-- Nur melden. Gelesen werden Meldungen nur von der Moderation (Dashboard/service_role).
create policy "reports: melden"
  on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and status = 'open');

revoke update, delete on public.reports from anon, authenticated;
