-- =============================================================================
-- asap – Melden (Issue #14)
--   * feste Meldegründe
--   * report_user(): Meldung speichern und (Standard) gleich blockieren – in einem Schritt
--   * höchstens 10 Meldungen pro Tag und Person (gegen Missbrauch der Meldefunktion)
--   * Moderations-Übersicht im Schema „moderation“ – nur im Supabase-Dashboard sichtbar,
--     nicht über die API (das Schema ist nicht freigegeben, keine Rechte für anon/authenticated)
-- =============================================================================

alter table public.reports
  add constraint reports_reason_valid
  check (reason in ('fake', 'inappropriate', 'harassment', 'spam', 'scam', 'underage', 'other'));

create or replace function public.report_user(
  p_user_id uuid,
  p_reason text,
  p_details text default null,
  p_idea_id uuid default null,
  p_match_id uuid default null,
  p_block boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  details text := nullif(left(btrim(coalesce(p_details, '')), 1000), '');
begin
  if me is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
  end if;
  if p_user_id = me or not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
  if p_reason is null or p_reason not in ('fake', 'inappropriate', 'harassment', 'spam', 'scam', 'underage', 'other') then
    raise exception using errcode = 'P0001', message = 'VALIDATION', detail = 'reason';
  end if;
  -- Kontext nur übernehmen, wenn er wirklich zu dieser Person gehört
  if p_idea_id is not null and not exists (select 1 from public.ideas where id = p_idea_id and owner_id = p_user_id) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
  if p_match_id is not null and not exists (
    select 1 from public.matches
    where id = p_match_id and ((user1_id = me and user2_id = p_user_id) or (user1_id = p_user_id and user2_id = me))
  ) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
  if (select count(*) from public.reports where reporter_id = me and created_at > now() - interval '1 day') >= 10 then
    raise exception using errcode = 'P0001', message = 'RATE_LIMIT';
  end if;

  insert into public.reports (reporter_id, reported_id, match_id, idea_id, reason, details)
  values (me, p_user_id, p_match_id, p_idea_id, p_reason, details);

  if p_block then
    insert into public.blocks (blocker_id, blocked_id) values (me, p_user_id)
    on conflict do nothing;
  end if;
end;
$$;

revoke all on function public.report_user(uuid, text, text, uuid, uuid, boolean) from public, anon;
grant execute on function public.report_user(uuid, text, text, uuid, uuid, boolean) to authenticated;

-- ---------- Moderation (nur Dashboard) ----------
create schema if not exists moderation;
revoke all on schema moderation from public, anon, authenticated;

-- Offene Meldungen mit Namen und Anzahl der Meldungen gegen dieselbe Person
create or replace view moderation.open_reports as
  select r.id, r.created_at, r.reason, r.details, r.status,
         r.reported_id, rp.name as reported_name,
         (select count(*) from public.reports x where x.reported_id = r.reported_id) as reports_against_person,
         r.reporter_id, rr.name as reporter_name,
         r.match_id, r.idea_id
  from public.reports r
  left join public.profiles rp on rp.id = r.reported_id
  left join public.profiles rr on rr.id = r.reporter_id
  where r.status = 'open'
  order by r.created_at;
