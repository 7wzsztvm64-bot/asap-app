-- =============================================================================
-- asap – Feed & Likes (Issue #7)
-- Alles, was „Interessiert an“ anderer Personen braucht (Kompatibilität), läuft
-- als security-definer-Funktion – die Spalte selbst bleibt für andere unsichtbar.
-- =============================================================================

-- ---------- Hilfsfunktionen (nicht über die API erreichbar) ----------
-- Öffentliche Profilfelder als JSON: Alter statt Geburtsdatum, ohne „Interessiert an“.
create or replace function private.profile_card(p public.profiles)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id, 'name', p.name, 'age', extract(year from age(p.birthdate))::integer,
    'gender', p.gender, 'city', p.city, 'bio', p.bio, 'photos', p.photos, 'interests', p.interests);
$$;

-- Passen zwei Personen gegenseitig zusammen (Geschlecht ↔ „Interessiert an“)?
create or replace function private.compatible(a public.profiles, b public.profiles)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(b.gender = any (a.interested_in) and a.gender = any (b.interested_in), false);
$$;

revoke all on function private.profile_card(public.profiles) from public;
revoke all on function private.compatible(public.profiles, public.profiles) from public;

-- ---------- get_public_profiles: zusätzlich „compatible“ ----------
-- (Rückgabetyp ändert sich, daher neu anlegen)
drop function public.get_public_profiles(uuid[]);

create function public.get_public_profiles(ids uuid[])
returns table (
  id uuid,
  name text,
  age integer,
  gender text,
  city text,
  bio text,
  photos jsonb,
  interests text[],
  compatible boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name, extract(year from age(p.birthdate))::integer, p.gender, p.city, p.bio, p.photos, p.interests,
         p.id = me.id or private.compatible(me, p)
  from public.profiles p, public.profiles me
  where me.id = (select auth.uid())
    and p.id = any (ids)
    and (p.id = me.id or (p.profile_complete and not private.is_blocked_between(p.id, me.id)));
$$;

revoke all on function public.get_public_profiles(uuid[]) from public, anon;
grant execute on function public.get_public_profiles(uuid[]) to authenticated;

-- ---------- Feed ----------
-- Aktive Ideen kompatibler Personen – ohne eigene, gelikte, übersprungene,
-- bereits gematchte und blockierte. Filter, Entfernung und Reihenfolge macht der Client.
create or replace function public.get_feed()
returns table (idea jsonb, owner jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(i) - 'deleted_at', private.profile_card(o)
  from public.profiles me
  join public.ideas i on i.active and i.deleted_at is null and i.owner_id <> me.id
  join public.profiles o on o.id = i.owner_id and o.profile_complete
  where me.id = (select auth.uid())
    and me.profile_complete
    and private.compatible(me, o)
    and not exists (select 1 from public.likes l where l.from_user_id = me.id and l.idea_id = i.id)
    and not exists (select 1 from public.passes ps where ps.user_id = me.id and ps.idea_id = i.id)
    and not exists (select 1 from public.matches m
                    where (m.user1_id = me.id and m.user2_id = o.id) or (m.user1_id = o.id and m.user2_id = me.id))
    and not private.is_blocked_between(me.id, o.id);
$$;

revoke all on function public.get_feed() from public, anon;
grant execute on function public.get_feed() to authenticated;

-- ---------- Liken ----------
create or replace function public.like_idea(p_idea_id uuid, p_message text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles;
  owner public.profiles;
  idea public.ideas;
  msg text := nullif(left(btrim(coalesce(p_message, '')), 200), '');
  new_like public.likes;
begin
  select * into me from public.profiles where id = (select auth.uid());
  if not found or not me.profile_complete then
    raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
  end if;
  if not exists (select 1 from public.ideas where owner_id = me.id and active and deleted_at is null) then
    raise exception using errcode = 'P0001', message = 'NEEDS_IDEA';
  end if;
  select * into idea from public.ideas where id = p_idea_id and active and deleted_at is null;
  if not found then
    raise exception using errcode = 'P0001', message = 'IDEA_UNAVAILABLE';
  end if;
  if idea.owner_id = me.id then
    raise exception using errcode = 'P0001', message = 'OWN_IDEA';
  end if;
  select * into owner from public.profiles where id = idea.owner_id;
  if not owner.profile_complete or private.is_blocked_between(me.id, owner.id) then
    raise exception using errcode = 'P0001', message = 'IDEA_UNAVAILABLE';
  end if;
  if not private.compatible(me, owner) then
    raise exception using errcode = 'P0001', message = 'NOT_COMPATIBLE';
  end if;
  if exists (select 1 from public.likes where from_user_id = me.id and idea_id = idea.id) then
    raise exception using errcode = 'P0001', message = 'DUPLICATE';
  end if;
  insert into public.likes (from_user_id, to_user_id, idea_id, message)
  values (me.id, owner.id, idea.id, msg)
  returning * into new_like;
  return to_jsonb(new_like);
end;
$$;

revoke all on function public.like_idea(uuid, text) from public, anon;
grant execute on function public.like_idea(uuid, text) to authenticated;

-- ---------- Gesendete Likes ----------
-- Ablehnungen werden als „pending“ ausgegeben – die likende Person erfährt davon nichts.
create or replace function public.get_sent_likes()
returns table (like_id uuid, created_at timestamptz, message text, status text, match_id uuid, idea jsonb, owner jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.created_at, l.message,
         case when m.id is not null then 'matched' else 'pending' end,
         m.id,
         to_jsonb(i),
         case when o.profile_complete and not private.is_blocked_between(o.id, l.from_user_id)
              then private.profile_card(o) end
  from public.likes l
  join public.ideas i on i.id = l.idea_id
  join public.profiles o on o.id = l.to_user_id
  left join public.matches m
    on (m.user1_id = l.from_user_id and m.user2_id = l.to_user_id) or (m.user1_id = l.to_user_id and m.user2_id = l.from_user_id)
  where l.from_user_id = (select auth.uid())
  order by l.created_at desc;
$$;

revoke all on function public.get_sent_likes() from public, anon;
grant execute on function public.get_sent_likes() to authenticated;

-- ---------- Anfrage annehmen oder ablehnen ----------
-- Annehmen erzeugt das Match (oder nutzt ein bestehendes), übernimmt die Nachricht
-- zum Like als Chat-Eröffnung und führt weitere offene Likes des Paares mit zusammen.
create or replace function public.respond_to_like(p_like_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  l public.likes;
  match_id uuid;
begin
  select * into l from public.likes where id = p_like_id and to_user_id = me for update;
  if not found or private.is_blocked_between(l.from_user_id, me) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
  if l.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'CONFLICT';
  end if;

  if not p_accept then
    update public.likes set status = 'declined', responded_at = now() where id = l.id;
    return jsonb_build_object('accepted', false);
  end if;

  select id into match_id from public.matches
   where (user1_id = me and user2_id = l.from_user_id) or (user1_id = l.from_user_id and user2_id = me);

  if match_id is null then
    insert into public.matches (user1_id, user2_id, idea_id, like_id, seen_by)
    values (me, l.from_user_id, l.idea_id, l.id, array[me])
    returning id into match_id;
    if l.message is not null then
      insert into public.messages (match_id, sender_id, text, from_like, read_at, created_at)
      values (match_id, l.from_user_id, l.message, true, now(), l.created_at);
    end if;
  end if;

  update public.likes
     set status = 'accepted', responded_at = now(), merged_into_match_id = match_id
   where id = l.id
      or (status = 'pending'
          and ((from_user_id = l.from_user_id and to_user_id = me) or (from_user_id = me and to_user_id = l.from_user_id)));

  return jsonb_build_object('accepted', true, 'matchId', match_id);
end;
$$;

revoke all on function public.respond_to_like(uuid, boolean) from public, anon;
grant execute on function public.respond_to_like(uuid, boolean) to authenticated;
