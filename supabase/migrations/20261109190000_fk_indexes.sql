-- =============================================================================
-- asap – Indizes für Fremdschlüssel (Hinweis des Supabase Performance Advisors)
-- Beschleunigen Joins und vor allem das kaskadierende Löschen eines Kontos (DSGVO).
-- =============================================================================

create index if not exists likes_merged_into_match_idx on public.likes (merged_into_match_id);
create index if not exists matches_idea_idx on public.matches (idea_id);
create index if not exists matches_like_idx on public.matches (like_id);
create index if not exists messages_sender_idx on public.messages (sender_id);
create index if not exists passes_idea_idx on public.passes (idea_id);
create index if not exists proposals_proposed_by_idx on public.proposals (proposed_by);
create index if not exists reports_idea_idx on public.reports (idea_id);
create index if not exists reports_match_idx on public.reports (match_id);
create index if not exists reports_reported_idx on public.reports (reported_id);
create index if not exists reports_reporter_idx on public.reports (reporter_id);
