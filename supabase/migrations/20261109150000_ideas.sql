-- =============================================================================
-- asap – Ideen (Issue #6)
-- Anlegen, Bearbeiten und Pausieren laufen direkt über die Tabelle (RLS aus #3).
-- Hier dazu: Obergrenze von 10 Ideen und Löschen als Funktion.
-- =============================================================================

-- ---------- Höchstens 10 (nicht gelöschte) Ideen pro Person ----------
create or replace function private.check_idea_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.ideas where owner_id = new.owner_id and deleted_at is null) >= 10 then
    raise exception using errcode = 'P0001', message = 'IDEA_LIMIT';
  end if;
  return new;
end;
$$;

create trigger ideas_check_limit
  before insert on public.ideas
  for each row execute function private.check_idea_limit();

-- ---------- Idee löschen (weich) ----------
-- Setzt deleted_at, pausiert die Idee und lehnt offene Anfragen dazu ab.
-- Bestehende Matches behalten ihre Idee (siehe Policy „ideas: lesen“).
create or replace function public.delete_idea(p_idea_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.ideas
     set deleted_at = now(), active = false
   where id = p_idea_id and owner_id = (select auth.uid()) and deleted_at is null;
  if not found then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  update public.likes
     set status = 'declined', responded_at = now()
   where idea_id = p_idea_id and status = 'pending';
end;
$$;

revoke all on function public.delete_idea(uuid) from public, anon;
grant execute on function public.delete_idea(uuid) to authenticated;
