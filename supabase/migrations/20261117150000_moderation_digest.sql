-- =============================================================================
-- asap – Moderations-Hinweis per Mail (Issue #24)
--   * Täglich um 07:00 UTC (8/9 Uhr in Deutschland) prüft pg_cron, ob Fotos zur
--     Prüfung, offene Meldungen oder neues Feedback warten – und schickt dann eine
--     kurze Mail über die Brevo-API (pg_net). Ohne Wartendes: keine Mail.
--   * Brevo-API-Schlüssel und Empfänger liegen verschlüsselt im Supabase Vault
--     (eintragen mit `npm run db:notify -- setup`). Fehlen sie, passiert nichts –
--     so bleibt das Testprojekt still.
--   * Die Mail enthält nur Anzahlen, keine Inhalte oder Namen.
-- =============================================================================

-- Erweiterungen gibt es nur bei Supabase; die lokale Test-Datenbank überspringt sie
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
  end if;
end;
$$;

create or replace function private.moderation_digest()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'photos',   (select count(*) from public.photos where status = 'pending'),
    'reports',  (select count(*) from public.reports where status = 'open'),
    'feedback', (select count(*) from public.feedback where status = 'new'));
$$;

-- p_force: auch ohne Wartendes senden (Testmail). Rückgabe: wurde eine Mail angestoßen?
create or replace function private.send_moderation_digest(p_force boolean default false)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  d jsonb := private.moderation_digest();
  photos int := (d ->> 'photos')::int;
  reports int := (d ->> 'reports')::int;
  feedback int := (d ->> 'feedback')::int;
  api_key text;
  email text;
begin
  if photos + reports + feedback = 0 and not p_force then
    return false;
  end if;
  select decrypted_secret into api_key from vault.decrypted_secrets where name = 'brevo_api_key';
  select decrypted_secret into email from vault.decrypted_secrets where name = 'moderation_email';
  if api_key is null or email is null then
    return false; -- nicht eingerichtet (z. B. Testprojekt)
  end if;
  perform net.http_post(
    url := 'https://api.brevo.com/v3/smtp/email',
    headers := jsonb_build_object('api-key', api_key, 'content-type', 'application/json', 'accept', 'application/json'),
    body := jsonb_build_object(
      'sender', jsonb_build_object('name', 'asap', 'email', email),
      'to', jsonb_build_array(jsonb_build_object('email', email)),
      'subject', format('asap: %s Foto(s), %s Meldung(en), %s Feedback warten', photos, reports, feedback),
      'htmlContent', format(
        '<div style="font-family:sans-serif;font-size:15px;line-height:1.5">'
        || '<p>Guten Morgen! In asap wartet:</p><ul>'
        || '<li><b>%s</b> Foto(s) zur Prüfung – <code>moderation.pending_photos</code></li>'
        || '<li><b>%s</b> offene Meldung(en) – <code>moderation.open_reports</code></li>'
        || '<li><b>%s</b> neues Feedback – <code>moderation.feedback_inbox</code></li></ul>'
        || '<p><a href="https://supabase.com/dashboard">Supabase-Dashboard öffnen</a> → Table Editor → Schema „moderation“.</p></div>',
        photos, reports, feedback)));
  return true;
end;
$$;

revoke all on function private.moderation_digest() from public;
revoke all on function private.send_moderation_digest(boolean) from public;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('asap-moderation-digest', '0 7 * * *', 'select private.send_moderation_digest()');
  end if;
end;
$$;
