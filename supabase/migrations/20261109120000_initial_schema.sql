-- =============================================================================
-- asap – Grundschema (Issue #2)
-- Bildet das Datenmodell des Mock-Backends (src/js/dataService.js) nachempfunden ab.
-- Anwenden: Supabase-Dashboard → SQL Editor → Inhalt einfügen → Run
--           (oder später per Supabase CLI: `supabase db push`).
--
-- Sicherheit: RLS ist auf JEDER Tabelle aktiv, aber noch ohne Policies.
-- Das heißt: Über die API (anon/authenticated) ist vorerst alles gesperrt.
-- Die Zugriffsregeln kommen in einer eigenen Migration (Issue #3).
--
-- Feste Werte (Kategorie, Budget, Dauer …) sind CHECK-Constraints statt Enums,
-- weil sie sich per Migration leichter ändern lassen. Sie entsprechen den
-- Konstanten in src/js/core.js – bei Änderungen beide Stellen anpassen.
-- =============================================================================

-- ---------- Hilfsfunktion: updated_at automatisch setzen ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- profiles ----------
-- Eine Zeile pro Konto, gleiche id wie auth.users. Die E-Mail liegt NUR in auth.users
-- (Datensparsamkeit). Konto löschen → Profil und alles Abhängige wird mitgelöscht.
create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  name             text not null default ''
                   check (name = '' or char_length(name) between 2 and 30),
  birthdate        date,
  gender           text check (gender in ('frau', 'mann', 'divers')),
  -- sensibles Datum (sexuelle Orientierung, DSGVO Art. 9) – nur für die Kompatibilitätsprüfung
  interested_in    text[] not null default '{}'
                   check (interested_in <@ array['frau', 'mann', 'divers']),
  city             text not null default '' check (char_length(city) <= 60),
  bio              text not null default '' check (char_length(bio) <= 300),
  interests        text[] not null default '{}' check (cardinality(interests) <= 10),
  -- vorerst Foto-Platzhalter ({ id, colors, emoji, pattern }); echte Fotos via Storage in Phase 2
  photos           jsonb not null default '[]'
                   check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 3),
  profile_complete boolean not null default false,
  onboarding_step  smallint not null default 0 check (onboarding_step >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------- ideas ----------
-- Soft-Delete über deleted_at, damit bestehende Matches ihre Idee behalten.
create table public.ideas (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  emoji       text not null check (char_length(emoji) <= 8),
  title       text not null check (char_length(title) between 5 and 80),
  description text not null check (char_length(description) between 20 and 300),
  category    text not null
              check (category in ('Essen & Trinken', 'Outdoor', 'Kultur', 'Sport', 'Abenteuer', 'Entspannt')),
  budget      text not null check (budget in ('€', '€€', '€€€')),
  duration    text not null
              check (duration in ('ca. 1 Std.', '1–2 Std.', '2–3 Std.', 'Halber Tag', 'Ganzer Tag')),
  time_of_day text not null
              check (time_of_day in ('Morgens', 'Mittags', 'Nachmittags', 'Abends', 'Ganztags')),
  location    text not null check (char_length(location) between 3 and 70),
  active      boolean not null default true,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index ideas_owner_idx on public.ideas (owner_id) where deleted_at is null;
create index ideas_feed_idx on public.ideas (created_at desc) where active and deleted_at is null;

create trigger ideas_set_updated_at
  before update on public.ideas
  for each row execute function public.set_updated_at();

-- ---------- likes ----------
-- Like auf eine Idee = Anfrage an die Person, der die Idee gehört.
-- to_user_id ist bewusst doppelt gespeichert (= ideas.owner_id), damit Abfragen
-- und RLS-Policies ohne Join auskommen.
-- „declined“ sieht nur die angefragte Person; für die likende bleibt es „offen“.
create table public.likes (
  id                   uuid primary key default gen_random_uuid(),
  from_user_id         uuid not null references public.profiles (id) on delete cascade,
  to_user_id           uuid not null references public.profiles (id) on delete cascade,
  idea_id              uuid not null references public.ideas (id) on delete cascade,
  status               text not null default 'pending'
                       check (status in ('pending', 'accepted', 'declined')),
  message              text check (char_length(message) between 1 and 200),
  merged_into_match_id uuid,  -- FK unten, da matches erst danach angelegt wird
  created_at           timestamptz not null default now(),
  responded_at         timestamptz,
  unique (from_user_id, idea_id),
  check (from_user_id <> to_user_id)
);

create index likes_to_user_idx on public.likes (to_user_id, status);
create index likes_idea_idx on public.likes (idea_id);

-- ---------- matches ----------
-- user1 = Person, die angenommen hat (Ideen-Besitzer:in), user2 = Person, die gelikt hat.
-- Pro Paar gibt es höchstens ein Match – egal in welcher Reihenfolge.
create table public.matches (
  id         uuid primary key default gen_random_uuid(),
  user1_id   uuid not null references public.profiles (id) on delete cascade,
  user2_id   uuid not null references public.profiles (id) on delete cascade,
  idea_id    uuid references public.ideas (id) on delete set null,
  like_id    uuid references public.likes (id) on delete set null,
  -- wer das Match schon gesehen hat (für den „Neu“-Hinweis)
  seen_by    uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  check (user1_id <> user2_id)
);

create unique index matches_pair_idx
  on public.matches (least(user1_id, user2_id), greatest(user1_id, user2_id));
create index matches_user1_idx on public.matches (user1_id);
create index matches_user2_idx on public.matches (user2_id);

alter table public.likes
  add constraint likes_merged_into_match_fkey
  foreign key (merged_into_match_id) references public.matches (id) on delete set null;

-- ---------- messages ----------
create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references public.matches (id) on delete cascade,
  sender_id  uuid not null references public.profiles (id) on delete cascade,
  text       text not null check (char_length(text) between 1 and 1000),
  from_like  boolean not null default false,  -- Nachricht stammt aus dem Like und eröffnet den Chat
  read_at    timestamptz,                      -- null = ungelesen
  created_at timestamptz not null default now()
);

create index messages_match_idx on public.messages (match_id, created_at);

-- ---------- proposals (Terminvorschläge) ----------
create table public.proposals (
  id           uuid primary key default gen_random_uuid(),
  match_id     uuid not null references public.matches (id) on delete cascade,
  proposed_by  uuid not null references public.profiles (id) on delete cascade,
  date_time    timestamptz not null,
  status       text not null default 'proposed'
               check (status in ('proposed', 'confirmed', 'declined')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz
);

create index proposals_match_idx on public.proposals (match_id);

-- ---------- passes (Idee übersprungen) ----------
create table public.passes (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  idea_id    uuid not null references public.ideas (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, idea_id)
);

-- ---------- blocks (Phase 2) ----------
create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index blocks_blocked_idx on public.blocks (blocked_id);

-- ---------- reports (Phase 2) ----------
-- Meldungen bleiben zur Moderation erhalten, auch wenn ein Konto gelöscht wird
-- (Personenbezug wird dann auf null gesetzt). Gründe werden in Phase 2 festgelegt.
create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles (id) on delete set null,
  reported_id uuid references public.profiles (id) on delete set null,
  match_id    uuid references public.matches (id) on delete set null,
  idea_id     uuid references public.ideas (id) on delete set null,
  reason      text not null check (char_length(reason) between 1 and 50),
  details     text check (char_length(details) <= 1000),
  status      text not null default 'open' check (status in ('open', 'reviewed', 'closed')),
  created_at  timestamptz not null default now()
);

-- ---------- Row Level Security: überall an, Policies folgen in Issue #3 ----------
alter table public.profiles  enable row level security;
alter table public.ideas     enable row level security;
alter table public.likes     enable row level security;
alter table public.matches   enable row level security;
alter table public.messages  enable row level security;
alter table public.proposals enable row level security;
alter table public.passes    enable row level security;
alter table public.blocks    enable row level security;
alter table public.reports   enable row level security;
