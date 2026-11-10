-- =============================================================================
-- asap – Daten herunterladen (Issue #16, DSGVO Art. 15 und 20)
-- Gibt alle personenbezogenen Daten der eingeloggten Person als JSON zurück.
-- Datensparsam: Inhalte anderer Personen (deren Nachrichten, Profile) sind nicht
-- enthalten – nur Vornamen als Bezug. Gesendete Likes ohne Annahme/Ablehnung
-- (wie in der App: „offen“ oder „Match“).
-- =============================================================================

create or replace function public.export_my_data()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select (select auth.uid()) as id),
  my_matches as (
    select m.*, case when m.user1_id = me.id then m.user2_id else m.user1_id end as other_id
    from public.matches m, me where me.id in (m.user1_id, m.user2_id)
  )
  select jsonb_build_object(
    'exportedAt', now(),
    'account', (select jsonb_build_object('id', u.id, 'email', u.email, 'createdAt', u.created_at, 'lastSignInAt', u.last_sign_in_at)
                from auth.users u, me where u.id = me.id),
    'profile', (select to_jsonb(p) from public.profiles p, me where p.id = me.id),
    'ideas', coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at) from public.ideas i, me where i.owner_id = me.id), '[]'),
    'likesSent', coalesce((select jsonb_agg(jsonb_build_object(
        'ideaTitle', i.title, 'to', o.name, 'message', l.message, 'createdAt', l.created_at,
        'status', case when exists (select 1 from my_matches mm where mm.other_id = l.to_user_id) then 'matched' else 'open' end)
        order by l.created_at)
      from public.likes l join public.ideas i on i.id = l.idea_id join public.profiles o on o.id = l.to_user_id, me
      where l.from_user_id = me.id), '[]'),
    'likesReceived', coalesce((select jsonb_agg(jsonb_build_object(
        'ideaTitle', i.title, 'from', f.name, 'message', l.message, 'status', l.status, 'createdAt', l.created_at, 'respondedAt', l.responded_at)
        order by l.created_at)
      from public.likes l join public.ideas i on i.id = l.idea_id join public.profiles f on f.id = l.from_user_id, me
      where l.to_user_id = me.id), '[]'),
    'matches', coalesce((select jsonb_agg(jsonb_build_object(
        'id', mm.id, 'with', o.name, 'ideaId', mm.idea_id, 'createdAt', mm.created_at) order by mm.created_at)
      from my_matches mm join public.profiles o on o.id = mm.other_id), '[]'),
    'messagesSent', coalesce((select jsonb_agg(jsonb_build_object(
        'matchId', x.match_id, 'text', x.text, 'createdAt', x.created_at, 'readAt', x.read_at) order by x.created_at)
      from public.messages x, me where x.sender_id = me.id), '[]'),
    'dateProposals', coalesce((select jsonb_agg(jsonb_build_object(
        'matchId', p.match_id, 'dateTime', p.date_time, 'status', p.status, 'proposedByMe', p.proposed_by = me.id, 'createdAt', p.created_at)
        order by p.created_at)
      from public.proposals p join my_matches mm on mm.id = p.match_id, me), '[]'),
    'skippedIdeas', coalesce((select jsonb_agg(jsonb_build_object('ideaId', s.idea_id, 'createdAt', s.created_at)) from public.passes s, me where s.user_id = me.id), '[]'),
    'blocked', coalesce((select jsonb_agg(jsonb_build_object('name', o.name, 'createdAt', b.created_at))
      from public.blocks b join public.profiles o on o.id = b.blocked_id, me where b.blocker_id = me.id), '[]'),
    'reportsMade', coalesce((select jsonb_agg(jsonb_build_object('reason', r.reason, 'details', r.details, 'createdAt', r.created_at, 'status', r.status))
      from public.reports r, me where r.reporter_id = me.id), '[]')
  );
$$;

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
