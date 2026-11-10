-- =============================================================================
-- asap – Blockieren (Issue #13)
-- Nach einer Blockierung (egal von wem) sehen beide Seiten weder Match noch Chat,
-- Terminvorschläge oder Anfragen der anderen Person – und können nichts mehr senden.
-- Die Daten bleiben erhalten (z. B. als Beleg für eine Meldung, #14) und tauchen
-- wieder auf, wenn die Blockierung aufgehoben wird.
-- Feed, Profile, Liken und Anfrage-Annahme berücksichtigen Blockierungen bereits (#3, #7).
-- =============================================================================

-- Match-Mitgliedschaft gilt nur, solange niemand blockiert hat.
-- Damit greifen automatisch: Nachrichten/Terminvorschläge lesen & schreiben,
-- mark_as_read, respond_to_proposal und der „schreibt …“-Kanal.
create or replace function private.is_match_member(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.matches m
    where m.id = p_match_id
      and (select auth.uid()) in (m.user1_id, m.user2_id)
      and not private.is_blocked_between(m.user1_id, m.user2_id)
  );
$$;

drop policy "matches: eigene lesen" on public.matches;
create policy "matches: eigene lesen"
  on public.matches for select to authenticated
  using ((select auth.uid()) in (user1_id, user2_id) and not private.is_blocked_between(user1_id, user2_id));

drop policy "likes: erhaltene lesen" on public.likes;
create policy "likes: erhaltene lesen"
  on public.likes for select to authenticated
  using (to_user_id = (select auth.uid()) and not private.is_blocked_between(from_user_id, to_user_id));

-- Eigene Blockierungen mit Namen anzeigen (für „Blockierte Personen“ im Profil).
-- security definer, weil blockierte Profile über get_public_profiles() bewusst unsichtbar sind.
create or replace function public.get_blocked_users()
returns table (id uuid, name text, photo jsonb, blocked_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name, p.photos -> 0, b.created_at
  from public.blocks b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = (select auth.uid())
  order by b.created_at desc;
$$;

revoke all on function public.get_blocked_users() from public, anon;
grant execute on function public.get_blocked_users() to authenticated;
