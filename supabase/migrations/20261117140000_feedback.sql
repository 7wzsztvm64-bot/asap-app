-- =============================================================================
-- asap – Feedback in der App (Issue #26)
--   * Profil → „Feedback geben“: Text plus App-Version und grober Gerätetyp
--     (z. B. „iOS · Safari“) – kein vollständiger User-Agent (Datensparsamkeit)
--   * Nur anlegen, nicht lesen: die Übersicht gibt es im Dashboard
--     (moderation.feedback_inbox); status setzt Noah dort auf read/done
--   * Höchstens 10 pro Tag und Person; wird mit dem Konto gelöscht
--   * Datenexport (#16) enthält das eigene Feedback
-- =============================================================================

create table public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  text        text not null check (char_length(btrim(text)) between 3 and 2000),
  app_version text check (char_length(app_version) <= 40),
  device      text check (char_length(device) <= 60),
  status      text not null default 'new' check (status in ('new', 'read', 'done')),
  created_at  timestamptz not null default now()
);

create index feedback_user_created_idx on public.feedback (user_id, created_at);

alter table public.feedback enable row level security;

revoke all on public.feedback from anon, authenticated;
grant insert (user_id, text, app_version, device) on public.feedback to authenticated;

create policy "feedback: eigenes anlegen"
  on public.feedback for insert to authenticated
  with check (user_id = (select auth.uid()));

-- security definer: die Person darf ihr Feedback nicht lesen, der Zähler schon
create or replace function private.check_feedback_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.feedback where user_id = new.user_id and created_at > now() - interval '1 day') >= 10 then
    raise exception using errcode = 'P0001', message = 'FEEDBACK_LIMIT';
  end if;
  return new;
end;
$$;

revoke all on function private.check_feedback_limit() from public;

create trigger feedback_check_limit
  before insert on public.feedback
  for each row execute function private.check_feedback_limit();

-- ---------- Dashboard ----------
create or replace view moderation.feedback_inbox as
  select f.id, f.created_at, f.status, f.text, f.app_version, f.device, f.user_id, p.name as user_name
  from public.feedback f
  left join public.profiles p on p.id = f.user_id
  order by f.status = 'done', f.created_at desc;

-- ---------- Datenexport um Feedback ergänzen ----------
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
      from public.reports r, me where r.reporter_id = me.id), '[]'),
    'feedback', coalesce((select jsonb_agg(jsonb_build_object('text', f.text, 'appVersion', f.app_version, 'device', f.device, 'createdAt', f.created_at)
      order by f.created_at) from public.feedback f, me where f.user_id = me.id), '[]')
  );
$$;


