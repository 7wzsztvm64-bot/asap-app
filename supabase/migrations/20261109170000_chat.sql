-- =============================================================================
-- asap – Chat in Echtzeit (Issue #8)
--   * get_match_summaries(): Chat-Liste in EINER Abfrage (statt alle Nachrichten zu laden)
--   * mark_as_read(): Match als gesehen + Nachrichten als gelesen markieren
--   * Realtime: neue/geänderte Zeilen werden an berechtigte Clients geschickt
--     (Supabase prüft dabei dieselben RLS-Policies wie beim Lesen)
--   * „schreibt …“ läuft über einen privaten Broadcast-Kanal pro Match ("match:<id>"),
--     den nur die beiden Beteiligten abonnieren und beschreiben dürfen
-- =============================================================================

-- ---------- Chat-Übersicht ----------
-- security invoker: läuft mit den Rechten der eingeloggten Person, RLS gilt also.
create or replace function public.get_match_summaries()
returns table (
  id uuid,
  created_at timestamptz,
  other_id uuid,
  idea_id uuid,
  seen boolean,
  last_message jsonb,
  message_count integer,
  unread integer,
  pending_proposal boolean,
  next_date timestamptz,
  last_proposal jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select m.id, m.created_at,
         case when m.user1_id = u.me then m.user2_id else m.user1_id end,
         m.idea_id,
         u.me = any (m.seen_by),
         (select to_jsonb(x) from public.messages x where x.match_id = m.id order by x.created_at desc limit 1),
         (select count(*)::integer from public.messages x where x.match_id = m.id),
         (select count(*)::integer from public.messages x where x.match_id = m.id and x.sender_id <> u.me and x.read_at is null),
         exists (select 1 from public.proposals p where p.match_id = m.id and p.status = 'proposed' and p.proposed_by <> u.me),
         (select min(p.date_time) from public.proposals p where p.match_id = m.id and p.status = 'confirmed' and p.date_time > now()),
         (select to_jsonb(p) from public.proposals p where p.match_id = m.id order by coalesce(p.responded_at, p.created_at) desc limit 1)
  from public.matches m, (select auth.uid() as me) u
  where u.me in (m.user1_id, m.user2_id);
$$;

revoke all on function public.get_match_summaries() from public, anon;
grant execute on function public.get_match_summaries() to authenticated;

-- ---------- Gelesen / gesehen ----------
create or replace function public.mark_as_read(p_match_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  seen_changed integer;
  read_changed integer;
begin
  if not private.is_match_member(p_match_id) then
    return false;
  end if;
  update public.matches set seen_by = array_append(seen_by, me)
   where id = p_match_id and not (me = any (seen_by));
  get diagnostics seen_changed = row_count;
  update public.messages set read_at = now()
   where match_id = p_match_id and sender_id <> me and read_at is null;
  get diagnostics read_changed = row_count;
  return seen_changed + read_changed > 0;
end;
$$;

revoke all on function public.mark_as_read(uuid) from public, anon;
grant execute on function public.mark_as_read(uuid) to authenticated;

-- ---------- Realtime für Tabellen ----------
alter publication supabase_realtime add table public.likes, public.matches, public.messages, public.proposals;

-- ---------- Privater Kanal „match:<id>“ für „schreibt …“ ----------
create or replace function private.can_use_match_topic(topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if topic !~ '^match:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return private.is_match_member(substring(topic from 7)::uuid);
end;
$$;

revoke all on function private.can_use_match_topic(text) from public;
grant execute on function private.can_use_match_topic(text) to authenticated;

create policy "realtime: Match-Kanal empfangen"
  on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast' and private.can_use_match_topic((select realtime.topic())));

create policy "realtime: Match-Kanal senden"
  on realtime.messages for insert to authenticated
  with check (realtime.messages.extension = 'broadcast' and private.can_use_match_topic((select realtime.topic())));
