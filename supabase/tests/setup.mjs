/* Gemeinsamer Aufbau für die Datenbank-Tests: PGlite (echtes Postgres als WebAssembly)
   mit nachgebildeter Supabase-Umgebung, danach alle Migrationen der Reihe nach. */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'migrations');

// Nachbildung dessen, was Supabase in jedem Projekt schon mitbringt
const SUPABASE_ENV = `
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, created_at timestamptz default now(), last_sign_in_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$
    select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  -- Realtime: Publication und die Tabelle für Broadcast-Autorisierung
  create publication supabase_realtime;
  create schema realtime;
  create table realtime.messages (id bigserial primary key, topic text not null, extension text not null, payload jsonb, event text);
  alter table realtime.messages enable row level security;
  create function realtime.topic() returns text language sql stable as $$ select nullif(current_setting('realtime.topic', true), '') $$;
  grant usage on schema realtime to authenticated;
  grant select, insert on realtime.messages to authenticated;
  grant usage on sequence realtime.messages_id_seq to authenticated;
  -- Storage: Buckets, Datei-Einträge und die Pfad-Hilfsfunktionen (wie bei Supabase)
  create schema storage;
  create table storage.buckets (id text primary key, name text not null, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now());
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id),
    name text, owner uuid, created_at timestamptz default now(), unique (bucket_id, name));
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language plpgsql as $$
    declare _parts text[];
    begin
      select string_to_array(name, '/') into _parts;
      return _parts[1 : array_length(_parts, 1) - 1];
    end
  $$;
  create function storage.extension(name text) returns text language plpgsql as $$
    declare _parts text[];
    begin
      select string_to_array(name, '/') into _parts;
      return reverse(split_part(reverse(_parts[array_length(_parts, 1)]), '.', 1));
    end
  $$;
  grant usage on schema storage to anon, authenticated, service_role;
  grant select, insert, update, delete on storage.objects to authenticated;
`;

export async function createTestDb() {
  const db = new PGlite();
  await db.exec(SUPABASE_ENV);
  for (const file of readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort()) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    } catch (e) {
      throw new Error(`Migration ${file} fehlgeschlagen: ${e.message}`);
    }
  }

  const helpers = {
    db,
    /** Als eingeloggte Person handeln (wie ein Request mit deren JWT). */
    async as(userId) {
      await db.exec('reset role');
      await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: userId, role: 'authenticated' })]);
      await db.exec('set role authenticated');
    },
    async asAnon() {
      await db.exec('reset role');
      await db.query(`select set_config('request.jwt.claims', '', false)`);
      await db.exec('set role anon');
    },
    async asAdmin() {
      await db.exec('reset role');
      await db.query(`select set_config('request.jwt.claims', '', false)`);
    },
    rows: async (sql, params) => (await db.query(sql, params)).rows,
    one: async (sql, params) => (await db.query(sql, params)).rows[0],
    /** Konto anlegen wie bei der Registrierung (Trigger erzeugt das Profil) und Profil ausfüllen. */
    async createUser(id, profile = {}) {
      await helpers.asAdmin();
      await db.query(`insert into auth.users (id) values ($1)`, [id]);
      const p = { name: 'Test', birthdate: '1995-05-05', gender: 'frau', interested_in: ['mann'], city: 'Frankfurt-Nordend',
        interests: ['Kaffee', 'Kino', 'Wandern'], photos: [{ id: 'ph0', colors: ['#000', '#fff'], emoji: null, pattern: 1 }], profile_complete: true, ...profile };
      await db.query(`update public.profiles set name = $2, birthdate = $3, gender = $4, interested_in = $5, city = $6,
        interests = $7, photos = $8, profile_complete = $9 where id = $1`,
      [id, p.name, p.birthdate, p.gender, p.interested_in, p.city, p.interests, JSON.stringify(p.photos), p.profile_complete]);
    },
    async createIdea(id, ownerId, extra = {}) {
      await helpers.asAdmin();
      const i = { title: 'Eine Test-Idee', description: 'Eine Beschreibung mit genug Zeichen.', category: 'Kultur', active: true, ...extra };
      await db.query(`insert into public.ideas (id, owner_id, emoji, title, description, category, budget, duration, time_of_day, location, active)
        values ($1, $2, '🎭', $3, $4, $5, '€', '1–2 Std.', 'Abends', 'Frankfurt', $6)`, [id, ownerId, i.title, i.description, i.category, i.active]);
    },
  };
  return helpers;
}

/** Erwartete Ablehnung durch RLS/Rechte */
export const DENIED = /row-level security|permission denied/;
