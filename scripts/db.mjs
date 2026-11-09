/* Migrationen ins echte Supabase-Projekt einspielen – über die Supabase Management-API.
   Braucht SUPABASE_ACCESS_TOKEN in .env (persönlicher Token von
   supabase.com/dashboard/account/tokens). Der Token hat Admin-Rechte:
   nie committen, nie mit VITE_-Präfix (sonst landet er im Frontend-Build).

     npm run db:migrate              – alle noch fehlenden Dateien aus supabase/migrations/ einspielen
     npm run db:query -- "select 1"  – einzelne SQL-Abfrage, Ergebnis als Tabelle

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

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.json().catch(() => ({}));
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

const [command, sql] = process.argv.slice(2);
try {
  if (command === 'migrate') await migrate();
  else if (command === 'query' && sql) console.table(await query(sql));
  else { console.error('Aufruf: npm run db:migrate  |  npm run db:query -- "SQL"'); process.exit(1); }
} catch (e) {
  console.error('✖', e.message);
  process.exit(1);
}
