-- =============================================================================
-- asap – Konto löschen (Issue #15, DSGVO Art. 17)
-- Löscht das Konto in auth.users. Alles andere erledigen die Fremdschlüssel:
--   profiles → ideas, likes, matches (→ messages, proposals), passes, blocks: on delete cascade
--   reports: Personenbezug wird auf null gesetzt (Meldungen bleiben für die Moderation)
-- Die Passwort-Abfrage vorher übernimmt die App (erneute Anmeldung).
-- =============================================================================

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
  end if;
  delete from auth.users where id = me;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
