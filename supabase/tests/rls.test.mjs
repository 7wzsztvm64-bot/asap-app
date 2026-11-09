/* Test der Row Level Security (Issue #3) – Start mit `npm run test:db`.
   Läuft komplett lokal mit PGlite, Aufbau siehe setup.mjs. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, DENIED } from './setup.mjs';

// Feste IDs, damit die Testdaten gut lesbar sind
const A = '00000000-0000-0000-0000-00000000000a'; // Jonas – „Person A“
const B = '00000000-0000-0000-0000-00000000000b'; // Mia
const C = '00000000-0000-0000-0000-00000000000c'; // Lena
const IDEA_A = '10000000-0000-0000-0000-00000000000a';
const IDEA_B = '10000000-0000-0000-0000-00000000000b';
const IDEA_B_PAUSED = '10000000-0000-0000-0000-0000000000b2';
const IDEA_C = '10000000-0000-0000-0000-00000000000c';
const MATCH_AB = '20000000-0000-0000-0000-0000000000ab';
const MATCH_BC = '20000000-0000-0000-0000-0000000000bc';

let db, as, asAnon, asAdmin, rows;

before(async () => {
  const t = await createTestDb();
  ({ db, as, asAnon, asAdmin, rows } = t);
  // Testdaten als Admin (wie im Dashboard)
  await t.createUser(A, { name: 'Jonas', gender: 'mann', interested_in: ['frau'] });
  await t.createUser(B, { name: 'Mia', gender: 'frau', interested_in: ['mann'] });
  await t.createUser(C, { name: 'Lena', gender: 'frau', interested_in: ['mann'] });
  await t.createIdea(IDEA_A, A, { title: 'Tischtennis-Duell' });
  await t.createIdea(IDEA_B, B, { title: 'Ramen-Abend' });
  await t.createIdea(IDEA_B_PAUSED, B, { title: 'Goetheturm', active: false });
  await t.createIdea(IDEA_C, C, { title: 'Flohmarkt-Challenge' });
  await asAdmin();
  await db.exec(`
    insert into public.matches (id, user1_id, user2_id, idea_id) values
      ('${MATCH_AB}', '${B}', '${A}', '${IDEA_B}'),
      ('${MATCH_BC}', '${C}', '${B}', '${IDEA_C}');
    insert into public.messages (match_id, sender_id, text) values
      ('${MATCH_AB}', '${A}', 'Hi Mia!'),
      ('${MATCH_AB}', '${B}', 'Hey Jonas 😊'),
      ('${MATCH_BC}', '${B}', 'Geheime Nachricht an Lena'),
      ('${MATCH_BC}', '${C}', 'Geheime Antwort an Mia');
    -- Lena hat Jonas' Idee gelikt, Jonas hat abgelehnt
    insert into public.likes (from_user_id, to_user_id, idea_id, status, responded_at) values
      ('${C}', '${A}', '${IDEA_A}', 'declined', now());
  `);
});

/* ---------- Abnahmekriterium aus Issue #3 ---------- */
test('Person A kann keine Nachrichten fremder Matches lesen', async () => {
  await as(A);
  assert.equal((await rows(`select * from public.messages where match_id = $1`, [MATCH_BC])).length, 0);
  const all = await rows(`select text from public.messages order by created_at`);
  assert.deepEqual(all.map(m => m.text).sort(), ['Hey Jonas 😊', 'Hi Mia!']);
});

test('Person A kann im eigenen Match schreiben, aber nicht in fremden oder als jemand anderes', async () => {
  await as(A);
  await db.query(`insert into public.messages (match_id, sender_id, text) values ($1, $2, 'Wann hast du Zeit?')`, [MATCH_AB, A]);
  await assert.rejects(db.query(`insert into public.messages (match_id, sender_id, text) values ($1, $2, 'Eingeschleust')`, [MATCH_BC, A]), DENIED);
  await assert.rejects(db.query(`insert into public.messages (match_id, sender_id, text) values ($1, $2, 'Gefälscht')`, [MATCH_AB, B]), DENIED);
  await assert.rejects(db.query(`update public.messages set text = 'geändert' where match_id = $1`, [MATCH_AB]), DENIED);
});

test('Ohne Login ist nichts lesbar', async () => {
  await asAnon();
  for (const table of ['profiles', 'ideas', 'likes', 'matches', 'messages', 'proposals', 'passes', 'blocks', 'reports']) {
    assert.equal((await rows(`select * from public.${table}`)).length, 0, table);
  }
  await assert.rejects(db.query(`select * from public.get_public_profiles($1)`, [[B]]), DENIED);
});

/* ---------- Profile ---------- */
test('Fremde Profile nur mit öffentlichen Feldern', async () => {
  await as(A);
  const direct = await rows(`select id from public.profiles`);
  assert.deepEqual(direct.map(r => r.id), [A], 'direkt nur das eigene Profil');
  const [mia] = await rows(`select * from public.get_public_profiles($1)`, [[B]]);
  assert.equal(mia.name, 'Mia');
  assert.equal(typeof mia.age, 'number');
  assert.ok(!('birthdate' in mia) && !('interested_in' in mia), 'kein Geburtsdatum, kein „Interessiert an“');
});

test('Eigenes Profil ändern ja, profile_complete und fremde Profile nein', async () => {
  await as(A);
  await db.query(`update public.profiles set bio = 'Neue Bio' where id = $1`, [A]);
  await assert.rejects(db.query(`update public.profiles set profile_complete = true where id = $1`, [A]), DENIED);
  const changed = await db.query(`update public.profiles set bio = 'gehackt' where id = $1`, [B]);
  assert.equal(changed.affectedRows, 0);
  await assert.rejects(db.query(`insert into public.profiles (id) values (gen_random_uuid())`), DENIED);
});

/* ---------- Ideen ---------- */
test('Ideen: pausierte fremde unsichtbar, fremde nicht änderbar', async () => {
  await as(A);
  const ids = (await rows(`select id from public.ideas`)).map(r => r.id);
  assert.ok(ids.includes(IDEA_B) && ids.includes(IDEA_C) && ids.includes(IDEA_A));
  assert.ok(!ids.includes(IDEA_B_PAUSED));
  const changed = await db.query(`update public.ideas set title = 'Gekapert!' where id = $1`, [IDEA_B]);
  assert.equal(changed.affectedRows, 0);
  await assert.rejects(db.query(`insert into public.ideas (owner_id, emoji, title, description, category, budget, duration, time_of_day, location)
    values ($1, '🎭', 'Fremde Idee', 'Im Namen einer anderen Person angelegt.', 'Kultur', '€', '1–2 Std.', 'Abends', 'Oper')`, [B]), DENIED);
});

test('Idee eines Matches bleibt sichtbar, auch wenn sie gelöscht wurde', async () => {
  await asAdmin();
  await db.query(`update public.ideas set deleted_at = now(), active = false where id = $1`, [IDEA_B]);
  await as(A);
  assert.equal((await rows(`select id from public.ideas where id = $1`, [IDEA_B])).length, 1);
  await asAdmin();
  await db.query(`update public.ideas set deleted_at = null, active = true where id = $1`, [IDEA_B]);
});

/* ---------- Likes & Matches ---------- */
test('Likes: Ablehnung ist für die likende Person nicht direkt lesbar', async () => {
  await as(C);
  assert.equal((await rows(`select * from public.likes`)).length, 0);
  await as(A);
  assert.equal((await rows(`select status from public.likes`))[0].status, 'declined');
});

test('Likes: nur im eigenen Namen, nur auf aktive Ideen, nicht direkt annehmen', async () => {
  await as(A);
  await db.query(`insert into public.likes (from_user_id, to_user_id, idea_id, message) values ($1, $2, $3, 'Bin dabei!')`, [A, C, IDEA_C]);
  await assert.rejects(db.query(`insert into public.likes (from_user_id, to_user_id, idea_id) values ($1, $2, $3)`, [B, C, IDEA_C]), DENIED);
  await assert.rejects(db.query(`insert into public.likes (from_user_id, to_user_id, idea_id) values ($1, $2, $3)`, [A, B, IDEA_B_PAUSED]), DENIED);
  await assert.rejects(db.query(`insert into public.likes (from_user_id, to_user_id, idea_id, status) values ($1, $2, $3, 'accepted')`, [A, B, IDEA_B]), DENIED);
  await as(C);
  await assert.rejects(db.query(`update public.likes set status = 'accepted'`), DENIED);
});

test('Matches: nur eigene sichtbar, nicht selbst anlegbar', async () => {
  await as(A);
  assert.deepEqual((await rows(`select id from public.matches`)).map(r => r.id), [MATCH_AB]);
  await assert.rejects(db.query(`insert into public.matches (user1_id, user2_id) values ($1, $2)`, [A, C]), DENIED);
});

/* ---------- Terminvorschläge ---------- */
test('Terminvorschläge nur im eigenen Match und in der Zukunft', async () => {
  await as(A);
  await db.query(`insert into public.proposals (match_id, proposed_by, date_time) values ($1, $2, now() + interval '2 days')`, [MATCH_AB, A]);
  await assert.rejects(db.query(`insert into public.proposals (match_id, proposed_by, date_time) values ($1, $2, now() + interval '2 days')`, [MATCH_BC, A]), DENIED);
  await assert.rejects(db.query(`insert into public.proposals (match_id, proposed_by, date_time) values ($1, $2, now() - interval '1 day')`, [MATCH_AB, A]), DENIED);
  await as(C);
  assert.equal((await rows(`select * from public.proposals`)).length, 0);
});

/* ---------- Blockieren & Melden ---------- */
test('Blockieren: blockierte Person sieht weder Profil noch Ideen und merkt es nicht', async () => {
  await asAdmin();
  await db.query(`delete from public.likes where from_user_id = $1 and idea_id = $2`, [A, IDEA_C]); // Like aus dem Like-Test
  await as(C);
  await db.query(`insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [C, A]);
  await as(A);
  assert.equal((await rows(`select * from public.get_public_profiles($1)`, [[C]])).length, 0);
  assert.equal((await rows(`select id from public.ideas where owner_id = $1`, [C])).length, 0);
  assert.equal((await rows(`select * from public.blocks`)).length, 0, 'Blockierung ist für A unsichtbar');
  await assert.rejects(db.query(`insert into public.likes (from_user_id, to_user_id, idea_id) values ($1, $2, $3)`, [A, C, IDEA_C]), DENIED);
  await as(C);
  await db.query(`delete from public.blocks where blocked_id = $1`, [A]);
});

test('Melden ja, Meldungen lesen nein', async () => {
  await as(A);
  await db.query(`insert into public.reports (reporter_id, reported_id, reason) values ($1, $2, 'spam')`, [A, B]);
  assert.equal((await rows(`select * from public.reports`)).length, 0);
  await assert.rejects(db.query(`insert into public.reports (reporter_id, reported_id, reason) values ($1, $2, 'spam')`, [B, A]), DENIED);
});
