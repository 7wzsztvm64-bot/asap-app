-- =============================================================================
-- asap – Foto-Upload mit Prüfung (Issue #18)
--   * Echte Fotos liegen im privaten Storage-Bucket „photos“ unter <user-id>/<uuid>.jpg
--     (im Browser verkleinert und als JPEG neu kodiert – dabei fallen EXIF/GPS-Daten weg)
--   * Pro Foto eine Zeile in public.photos mit Status pending → approved/rejected
--   * Andere sehen ein Foto erst nach der Freigabe (status = 'approved'). Das gilt
--     auch für den Dateizugriff selbst: Storage-Policy prüft Status und Blockierung.
--   * Freigabe von Hand im Supabase-Dashboard (moderation.pending_photos)
--   * Die Farb-Platzhalter in profiles.photos bleiben als Ersatz, solange kein
--     freigegebenes Foto da ist.
--   * Dateien lassen sich per SQL nicht löschen (Supabase-Schutz protect_delete) –
--     das erledigt die App über die Storage-API (Foto löschen, Konto löschen).
--     Liegengebliebene Dateien zeigt moderation.orphan_photo_files.
-- =============================================================================

-- ---------- Bucket ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

-- ---------- Tabelle ----------
create table public.photos (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  path        text not null unique,
  position    smallint not null default 0 check (position between 0 and 2),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz,
  -- Nur Dateien im eigenen Ordner, fester Name (keine Pfad-Tricks)
  constraint photos_path_in_own_folder check (path ~ ('^' || owner_id::text || '/[0-9a-f-]{36}\.jpg$'))
);

create index photos_owner_idx on public.photos (owner_id, position);
create index photos_pending_idx on public.photos (created_at) where status = 'pending';

alter table public.photos enable row level security;

-- Höchstens 3 Fotos pro Person; Prüfzeitpunkt automatisch setzen
create or replace function private.photos_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.photos where owner_id = new.owner_id) >= 3 then
      raise exception using errcode = 'P0001', message = 'PHOTO_LIMIT';
    end if;
  elsif new.status is distinct from old.status then
    new.reviewed_at := case when new.status = 'pending' then null else now() end;
  end if;
  return new;
end;
$$;

create trigger photos_before_write
  before insert or update on public.photos
  for each row execute function private.photos_before_write();

-- ---------- Rechte ----------
-- Eigene Fotos lesen, anlegen (immer als „pending“), Reihenfolge ändern, löschen.
-- Den Status kann nur die Moderation (Dashboard) ändern – keine Spaltenrechte dafür.
revoke all on public.photos from anon, authenticated;
grant select, delete on public.photos to authenticated;
grant insert (owner_id, path, position) on public.photos to authenticated;
grant update (position) on public.photos to authenticated;

create policy "photos: eigene lesen"
  on public.photos for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "photos: eigene anlegen"
  on public.photos for insert to authenticated
  with check (owner_id = (select auth.uid()) and status = 'pending');

create policy "photos: eigene sortieren"
  on public.photos for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "photos: eigene löschen"
  on public.photos for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ---------- Storage-Policies (Bucket „photos“) ----------
-- Darf die eingeloggte Person die Datei sehen? Eigene immer, fremde nur freigegeben,
-- bei vollständigem Profil und ohne Blockierung.
create or replace function private.photo_visible(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.photos ph
    join public.profiles o on o.id = ph.owner_id
    where ph.path = p_path
      and ph.status = 'approved'
      and o.profile_complete
      and not private.is_blocked_between(ph.owner_id, (select auth.uid()))
  );
$$;

-- Höchstens 3 Dateien im eigenen Ordner
create or replace function private.photo_upload_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*) from storage.objects
          where bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text) < 3;
$$;

revoke all on function private.photo_visible(text) from public;
revoke all on function private.photo_upload_allowed() from public;
grant execute on function private.photo_visible(text) to authenticated;
grant execute on function private.photo_upload_allowed() to authenticated;

create policy "photos: eigene oder freigegebene Dateien lesen"
  on storage.objects for select to authenticated
  using (bucket_id = 'photos'
         and ((storage.foldername(name))[1] = (select auth.uid())::text or private.photo_visible(name)));

-- Kein Update-Recht: eine freigegebene Datei lässt sich nicht nachträglich austauschen.
create policy "photos: in eigenen Ordner hochladen"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'photos'
              and (storage.foldername(name))[1] = (select auth.uid())::text
              and storage.extension(name) = 'jpg'
              and private.photo_upload_allowed());

create policy "photos: eigene Dateien löschen"
  on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------- Fotos in den Profil-Funktionen ----------
-- Freigegebene Fotos (für die Person selbst auch die wartenden), sonst die Farb-Platzhalter.
-- Nur aus security-definer-Funktionen aufgerufen.
create or replace function private.visible_photos(p public.profiles)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select jsonb_agg(jsonb_build_object('id', ph.id, 'path', ph.path, 'status', ph.status) order by ph.position, ph.created_at)
     from public.photos ph
     where ph.owner_id = p.id
       and (ph.status = 'approved' or (ph.status = 'pending' and ph.owner_id = (select auth.uid())))),
    p.photos);
$$;

revoke all on function private.visible_photos(public.profiles) from public;

create or replace function private.profile_card(p public.profiles)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id, 'name', p.name, 'age', extract(year from age(p.birthdate))::integer,
    'gender', p.gender, 'city', p.city, 'bio', p.bio, 'photos', private.visible_photos(p), 'interests', p.interests);
$$;

create or replace function public.get_public_profiles(ids uuid[])
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
  select p.id, p.name, extract(year from age(p.birthdate))::integer, p.gender, p.city, p.bio, private.visible_photos(p), p.interests,
         p.id = me.id or private.compatible(me, p)
  from public.profiles p, public.profiles me
  where me.id = (select auth.uid())
    and p.id = any (ids)
    and (p.id = me.id or (p.profile_complete and not private.is_blocked_between(p.id, me.id)));
$$;

-- ---------- Datenexport (#16): Fotos ergänzen ----------
-- Die App hängt beim Download zeitlich begrenzte Links zu den Dateien an.
create or replace function public.export_my_photos()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('path', ph.path, 'status', ph.status, 'createdAt', ph.created_at, 'reviewedAt', ph.reviewed_at)
                  order by ph.position), '[]')
  from public.photos ph
  where ph.owner_id = (select auth.uid());
$$;

revoke all on function public.export_my_photos() from public, anon;
grant execute on function public.export_my_photos() to authenticated;

-- ---------- Moderation (nur Dashboard) ----------
-- Wartende Fotos: Datei im Dashboard unter Storage → photos → <owner_id> ansehen,
-- dann in public.photos den status auf 'approved' oder 'rejected' setzen.
create or replace view moderation.pending_photos as
  select ph.id, ph.created_at, ph.path, ph.owner_id, p.name as owner_name,
         (select count(*) from public.reports r where r.reported_id = ph.owner_id) as reports_against_person
  from public.photos ph
  join public.profiles p on p.id = ph.owner_id
  where ph.status = 'pending'
  order by ph.created_at;

-- Dateien ohne Eintrag (z. B. abgebrochener Upload) – im Dashboard unter Storage löschen
create or replace view moderation.orphan_photo_files as
  select o.name as path, o.created_at
  from storage.objects o
  where o.bucket_id = 'photos'
    and o.created_at < now() - interval '1 hour'
    and not exists (select 1 from public.photos ph where ph.path = o.name)
  order by o.created_at;
