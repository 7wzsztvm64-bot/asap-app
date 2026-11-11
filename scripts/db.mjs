/* Migrationen ins echte Supabase-Projekt einspielen – über die Supabase Management-API.
   Braucht SUPABASE_ACCESS_TOKEN in .env (persönlicher Token von
   supabase.com/dashboard/account/tokens). Der Token hat Admin-Rechte:
   nie committen, nie mit VITE_-Präfix (sonst landet er im Frontend-Build).

     npm run db:migrate              – alle noch fehlenden Dateien aus supabase/migrations/ einspielen
     npm run db:query -- "select 1"  – einzelne SQL-Abfrage, Ergebnis als Tabelle (mit --json als JSON)
     npm run db:seed                 – Testpersonen (@datedate.app, Passwort Test1234) neu anlegen
     npm run db:auth                 – Auth-Einstellungen aus supabase/auth/ (+ SMTP aus .env) übernehmen

   Welche Migrationen schon drin sind, steht wie bei der Supabase CLI in
   supabase_migrations.schema_migrations – ein späterer Wechsel zur CLI bleibt also möglich. */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'supabase', 'migrations');

try { process.loadEnvFile('.env'); } catch { /* fehlende .env wird unten gemeldet */ }
const token = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = (process.env.VITE_SUPABASE_URL || '').match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];

if (!token || !projectRef) {
  console.error('SUPABASE_ACCESS_TOKEN und VITE_SUPABASE_URL müssen in .env stehen (siehe .env.example).');
  process.exit(1);
}

// Erinnerung: Der Access Token läuft ab (Datum in .env: SUPABASE_ACCESS_TOKEN_EXPIRES=JJJJ-MM-TT)
const TOKEN_HELP = 'Neuen Token unter https://supabase.com/dashboard/account/tokens erstellen (30 Tage) und in .env '
  + 'SUPABASE_ACCESS_TOKEN sowie SUPABASE_ACCESS_TOKEN_EXPIRES aktualisieren.';
const expires = process.env.SUPABASE_ACCESS_TOKEN_EXPIRES;
if (expires) {
  const daysLeft = Math.ceil((new Date(expires + 'T23:59:59') - Date.now()) / 86400000);
  if (daysLeft <= 7) console.warn(`⚠️  Der Supabase Access Token läuft ${daysLeft > 0 ? `in ${daysLeft} Tag(en)` : 'heute oder ist schon'} ab (${expires}). ${TOKEN_HELP}\n`);
}

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error(`Der Access Token ist ungültig oder abgelaufen. ${TOKEN_HELP}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.message || JSON.stringify(body)}`);
  return body;
}

async function migrate() {
  await query(`
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
  `);
  const applied = new Set((await query('select version from supabase_migrations.schema_migrations')).map(r => r.version));
  const files = readdirSync(MIGRATIONS_DIR).filter(f => /^\d+_.+\.sql$/.test(f)).sort();
  const pending = files.filter(f => !applied.has(f.split('_')[0]));
  if (!pending.length) return console.log('Alles aktuell – keine neuen Migrationen.');
  for (const file of pending) {
    const [version] = file.split('_');
    const name = file.slice(version.length + 1, -4);
    // Migration und Buchführung in EINER Anfrage = eine Transaktion: schlägt etwas fehl, wird nichts übernommen.
    await query(`${readFileSync(join(MIGRATIONS_DIR, file), 'utf8')}
      ;insert into supabase_migrations.schema_migrations (version, name) values ('${version}', '${name}');`);
    console.log(`✔ ${file}`);
  }
}

/* Foto-Dateien der Testkonten löschen. Per SQL lässt Supabase das nicht zu (siehe Migration photos.sql),
   daher über die Storage-API mit dem Secret-Key – der wird nur für diesen Aufruf über die
   Management-API geholt und nirgends gespeichert. */
async function removeSeedPhotos() {
  const files = (await query(`select o.name from storage.objects o join auth.users u on (storage.foldername(o.name))[1] = u.id::text
    where o.bucket_id = 'photos' and u.email like '%@datedate.app'`)).map(r => r.name);
  if (!files.length) return;
  const keys = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${token}` } });
  if (!keys.ok) throw new Error(`API-Keys: HTTP ${keys.status}`);
  const secret = (await keys.json()).find(k => k.type === 'secret')?.api_key;
  if (!secret) throw new Error('Kein Secret-Key im Projekt gefunden (Dashboard → Settings → API Keys).');
  const res = await fetch(`${process.env.VITE_SUPABASE_URL}/storage/v1/object/photos`, {
    method: 'DELETE',
    headers: { apikey: secret, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: files }),
  });
  if (!res.ok) throw new Error(`Foto-Dateien löschen: HTTP ${res.status} ${await res.text()}`);
  console.log(`✔ ${files.length} Foto-Datei(en) der Testkonten gelöscht`);
}

/* Testdaten aus src/js/seed.js (dieselben wie im Mock-Backend) als SQL einspielen.
   Löscht vorher alle Konten mit @datedate.app – inkl. allem, was daran hängt. Nur für Testprojekte! */
async function seed() {
  const { buildSeedDB, seedUuid, TEST_PASSWORD } = await import('../src/js/seed.js');
  const data = await buildSeedDB();
  await removeSeedPhotos();
  const U = id => `'${seedUuid(id)}'::uuid`;
  const lit = v => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
  const ts = ms => (ms == null ? 'null' : `to_timestamp(${ms / 1000})`);
  const texts = list => `array[${list.map(lit).join(',')}]::text[]`;
  const sql = ["delete from auth.users where email like '%@datedate.app';"];
  for (const u of data.users) {
    sql.push(`insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
      values ('00000000-0000-0000-0000-000000000000', ${U(u.id)}, 'authenticated', 'authenticated', ${lit(u.email)},
        extensions.crypt(${lit(TEST_PASSWORD)}, extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}',
        ${ts(u.createdAt)}, now(), '', '', '', '');`);
    sql.push(`insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), ${U(u.id)}, ${lit(seedUuid(u.id))}, jsonb_build_object('sub', ${lit(seedUuid(u.id))}, 'email', ${lit(u.email)}, 'email_verified', true),
        'email', now(), now(), now());`);
    sql.push(`update public.profiles set name = ${lit(u.name)}, birthdate = ${lit(u.birthdate)}, gender = ${lit(u.gender)},
        interested_in = ${texts(u.interestedIn)}, city = ${lit(u.city)}, bio = ${lit(u.bio)}, interests = ${texts(u.interests)},
        photos = ${lit(JSON.stringify(u.photos))}::jsonb, profile_complete = true, onboarding_step = 99, created_at = ${ts(u.createdAt)}
      where id = ${U(u.id)};`);
  }
  for (const i of data.ideas) {
    sql.push(`insert into public.ideas (id, owner_id, emoji, title, description, category, budget, duration, time_of_day, location, active, created_at)
      values (${U(i.id)}, ${U(i.ownerId)}, ${lit(i.emoji)}, ${lit(i.title)}, ${lit(i.description)}, ${lit(i.category)}, ${lit(i.budget)},
        ${lit(i.duration)}, ${lit(i.timeOfDay)}, ${lit(i.location)}, ${i.active}, ${ts(i.createdAt)});`);
  }
  for (const l of data.likes) {
    sql.push(`insert into public.likes (id, from_user_id, to_user_id, idea_id, status, message, created_at, responded_at)
      values (${U(l.id)}, ${U(l.fromUserId)}, ${U(l.toUserId)}, ${U(l.ideaId)}, ${lit(l.status)}, ${lit(l.message)}, ${ts(l.createdAt)}, ${ts(l.respondedAt)});`);
  }
  for (const m of data.matches) {
    sql.push(`insert into public.matches (id, user1_id, user2_id, idea_id, like_id, seen_by, created_at)
      values (${U(m.id)}, ${U(m.userIds[0])}, ${U(m.userIds[1])}, ${U(m.ideaId)}, ${U(m.likeId)},
        array[${m.seenBy.map(U).join(',')}]::uuid[], ${ts(m.createdAt)});`);
  }
  for (const msg of data.messages) {
    sql.push(`insert into public.messages (id, match_id, sender_id, text, read_at, created_at)
      values (${U(msg.id)}, ${U(msg.matchId)}, ${U(msg.senderId)}, ${lit(msg.text)}, ${msg.read ? ts(msg.createdAt + 60000) : 'null'}, ${ts(msg.createdAt)});`);
  }
  for (const p of data.proposals) {
    sql.push(`insert into public.proposals (id, match_id, proposed_by, date_time, status, created_at, responded_at)
      values (${U(p.id)}, ${U(p.matchId)}, ${U(p.proposedBy)}, ${lit(p.dateTime)}, ${lit(p.status)}, ${ts(p.createdAt)}, ${ts(p.respondedAt)});`);
  }
  await query(sql.join('\n'));
  console.log(`✔ Testdaten: ${data.users.length} Konten (Passwort ${TEST_PASSWORD}), ${data.ideas.length} Ideen, ${data.likes.length} Likes, ` +
    `${data.matches.length} Matches, ${data.messages.length} Nachrichten, ${data.proposals.length} Termin(e)`);
}

/* Auth-Einstellungen aus supabase/auth/ übernehmen (Weiterleitungen, Passwortlänge, deutsche Mail-Vorlage).
   Sind SMTP_* in .env gesetzt, wird zusätzlich der eigene Mailversand (z. B. Brevo) eingetragen. */
async function applyAuthConfig() {
  const dir = join(import.meta.dirname, '..', 'supabase', 'auth');
  const config = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'));
  config.mailer_templates_confirmation_content = readFileSync(join(dir, 'confirmation.html'), 'utf8');
  config.mailer_templates_recovery_content = readFileSync(join(dir, 'recovery.html'), 'utf8');
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SENDER_EMAIL } = process.env;
  if (SMTP_HOST && SMTP_USER && SMTP_PASS && SMTP_SENDER_EMAIL) {
    Object.assign(config, { smtp_host: SMTP_HOST, smtp_port: String(SMTP_PORT || 587), smtp_user: SMTP_USER, smtp_pass: SMTP_PASS,
      smtp_admin_email: SMTP_SENDER_EMAIL, smtp_sender_name: 'asap', rate_limit_email_sent: 30 });
  } else {
    // Eigene Mail-Vorlagen erlaubt Supabase (Free) erst mit eigenem Mailversand
    for (const key of Object.keys(config)) if (key.startsWith('mailer_subjects_') || key.startsWith('mailer_templates_')) delete config[key];
  }
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error(`Der Access Token ist ungültig oder abgelaufen. ${TOKEN_HELP}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.message || JSON.stringify(body)}`);
  console.log(`✔ Auth-Einstellungen übernommen (Weiterleitung ${body.site_url}, Passwort ≥ ${body.password_min_length} Zeichen, `
    + `Mailversand: ${body.smtp_host ? `${body.smtp_host} als ${body.smtp_admin_email}` : 'Supabase-Standard (nur Team-Adressen, 2/Std.)'})`);
}

const [command, sql] = process.argv.slice(2);
try {
  if (command === 'migrate') await migrate();
  else if (command === 'seed') await seed();
  else if (command === 'auth') await applyAuthConfig();
  else if (command === 'query' && sql) {
    const rows = await query(sql);
    if (process.argv.includes('--json')) console.log(JSON.stringify(rows)); else console.table(rows);
  }
  else { console.error('Aufruf: npm run db:migrate  |  npm run db:seed  |  npm run db:auth  |  npm run db:query -- "SQL"'); process.exit(1); }
} catch (e) {
  console.error('✖', e.message);
  process.exit(1);
}
