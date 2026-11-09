-- =============================================================================
-- asap – Terminvorschläge & Dates (Issue #9)
-- Vorschlagen läuft direkt über die Tabelle (Policy „proposals: vorschlagen“ aus #3).
-- Beantworten nur über diese Funktion: nur die andere Person, nur einmal.
-- =============================================================================

create or replace function public.respond_to_proposal(p_proposal_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.proposals;
begin
  select * into p from public.proposals where id = p_proposal_id for update;
  if not found or not private.is_match_member(p.match_id) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
  if p.proposed_by = (select auth.uid()) then
    raise exception using errcode = 'P0001', message = 'OWN_PROPOSAL';
  end if;
  if p.status <> 'proposed' then
    raise exception using errcode = 'P0001', message = 'CONFLICT';
  end if;
  update public.proposals
     set status = case when p_accept then 'confirmed' else 'declined' end, responded_at = now()
   where id = p.id
  returning * into p;
  return to_jsonb(p);
end;
$$;

revoke all on function public.respond_to_proposal(uuid, boolean) from public, anon;
grant execute on function public.respond_to_proposal(uuid, boolean) to authenticated;
