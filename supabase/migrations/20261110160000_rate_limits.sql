-- =============================================================================
-- asap – Missbrauchsschutz (Issue #19)
-- Serverseitige Obergrenzen gegen Spam. Großzügig gewählt, damit sie bei normaler
-- Nutzung nie greifen. Meldungen: 10 pro Tag (siehe reports.sql).
--   Likes            50 pro 24 Std.
--   Nachrichten      20 pro Minute
--   neue Ideen       20 pro 24 Std. (zusätzlich max. 10 gleichzeitig, siehe ideas.sql)
--   Terminvorschläge 3 offene pro Match und Person
-- =============================================================================

create index if not exists likes_from_user_created_idx on public.likes (from_user_id, created_at);
create index if not exists messages_sender_created_idx on public.messages (sender_id, created_at);
create index if not exists ideas_owner_created_idx on public.ideas (owner_id, created_at);

-- ---------- Likes: in like_idea() prüfen ----------
create or replace function private.check_like_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.likes where from_user_id = new.from_user_id and created_at > now() - interval '24 hours') >= 50 then
    raise exception using errcode = 'P0001', message = 'LIKE_LIMIT';
  end if;
  return new;
end;
$$;

create trigger likes_check_limit
  before insert on public.likes
  for each row execute function private.check_like_limit();

-- ---------- Nachrichten ----------
create or replace function private.check_message_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not new.from_like
     and (select count(*) from public.messages where sender_id = new.sender_id and created_at > now() - interval '1 minute') >= 20 then
    raise exception using errcode = 'P0001', message = 'MESSAGE_LIMIT';
  end if;
  return new;
end;
$$;

create trigger messages_check_limit
  before insert on public.messages
  for each row execute function private.check_message_limit();

-- ---------- Ideen (ergänzt check_idea_limit aus ideas.sql) ----------
create or replace function private.check_idea_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.ideas where owner_id = new.owner_id and deleted_at is null) >= 10 then
    raise exception using errcode = 'P0001', message = 'IDEA_LIMIT';
  end if;
  if (select count(*) from public.ideas where owner_id = new.owner_id and created_at > now() - interval '24 hours') >= 20 then
    raise exception using errcode = 'P0001', message = 'IDEA_DAILY_LIMIT';
  end if;
  return new;
end;
$$;

-- ---------- Terminvorschläge ----------
create or replace function private.check_proposal_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.proposals
      where match_id = new.match_id and proposed_by = new.proposed_by and status = 'proposed') >= 3 then
    raise exception using errcode = 'P0001', message = 'PROPOSAL_LIMIT';
  end if;
  return new;
end;
$$;

create trigger proposals_check_limit
  before insert on public.proposals
  for each row execute function private.check_proposal_limit();
