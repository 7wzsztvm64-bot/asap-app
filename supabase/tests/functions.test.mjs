/* Tests der Datenbank-Funktionen (Issues #4–#9) – Start mit `npm run test:db`. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, DENIED } from './setup.mjs';

const JONAS = '00000000-0000-0000-0000-0000000000a1'; // Mann, sucht Frauen
const MIA = '00000000-0000-0000-0000-0000000000b1';   // Frau, sucht Männer
const LENA = '00000000-0000-0000-0000-0000000000c1';  // Frau, sucht Männer
const ALEX = '00000000-0000-0000-0000-0000000000d1';  // Mann, sucht Männer – passt zu niemandem hier
const NEU = '00000000-0000-0000-0000-0000000000e1';   // frisch registriert, Profil leer
const I_JONAS = '10000000-0000-0000-0000-0000000000a1';
const I_MIA = '10000000-0000-0000-0000-0000000000b1';
const I_MIA2 = '10000000-0000-0000-0000-0000000000b2';
const I_LENA = '10000000-0000-0000-0000-0000000000c1';
const I_ALEX = '10000000-0000-0000-0000-0000000000d1';

let t;
const code = re => new RegExp(re); // Fehlercodes stehen in der message

before(async () => {
  t = await createTestDb();
  await t.createUser(JONAS, { name: 'Jonas', gender: 'mann', interested_in: ['frau'] });
  await t.createUser(MIA, { name: 'Mia', gender: 'frau', interested_in: ['mann'] });
  await t.createUser(LENA, { name: 'Lena', gender: 'frau', interested_in: ['mann'] });
  await t.createUser(ALEX, { name: 'Alex', gender: 'mann', interested_in: ['mann'] });
  await t.createIdea(I_JONAS, JONAS);
  await t.createIdea(I_MIA, MIA);
  await t.createIdea(I_MIA2, MIA, { title: 'Zweite Idee von Mia' });
  await t.createIdea(I_LENA, LENA);
  await t.createIdea(I_ALEX, ALEX);
});

/* ---------- #4 / #5 Registrierung & Onboarding ---------- */
test('Registrierung legt automatisch ein leeres Profil an', async () => {
  await t.asAdmin();
  await t.db.query(`insert into auth.users (id) values ($1)`, [NEU]);
  await t.as(NEU);
  const me = await t.one(`select * from public.profiles where id = $1`, [NEU]);
  assert.equal(me.profile_complete, false);
  assert.equal(me.name, '');
});

test('18+ wird serverseitig geprüft', async () => {
  await t.as(NEU);
  const sixteen = new Date(Date.now() - 16 * 365.25 * 86400000).toISOString().slice(0, 10);
  await assert.rejects(t.db.query(`update public.profiles set birthdate = $1 where id = $2`, [sixteen, NEU]), code('UNDERAGE'));
});

test('Onboarding abschließen nur mit vollständigem Profil', async () => {
  await t.as(NEU);
  await assert.rejects(t.db.query(`select public.complete_onboarding()`), code('PROFILE_INCOMPLETE'));
  await t.db.query(`update public.profiles set name = 'Neu', birthdate = '2000-01-01', gender = 'divers', interested_in = '{frau,mann,divers}',
    city = 'Offenbach am Main', interests = '{Kaffee,Kino,Jazz}', photos = '[{"id":"x","colors":["#000","#fff"],"emoji":null,"pattern":1}]' where id = $1`, [NEU]);
  await t.db.query(`select public.complete_onboarding()`);
  assert.equal((await t.one(`select profile_complete from public.profiles where id = $1`, [NEU])).profile_complete, true);
  // vollständiges Profil darf nicht wieder unvollständig werden
  await assert.rejects(t.db.query(`update public.profiles set city = '' where id = $1`, [NEU]), code('PROFILE_INCOMPLETE'));
});

/* ---------- #6 Ideen ---------- */
test('Höchstens 10 Ideen pro Person', async () => {
  await t.as(NEU);
  const insert = n => t.db.query(`insert into public.ideas (owner_id, emoji, title, description, category, budget, duration, time_of_day, location)
    values ($1, '🎭', $2, 'Eine Beschreibung mit genug Zeichen.', 'Kultur', '€', '1–2 Std.', 'Abends', 'Frankfurt')`, [NEU, 'Idee Nummer ' + n]);
  for (let n = 1; n <= 10; n++) await insert(n);
  await assert.rejects(insert(11), code('IDEA_LIMIT'));
});

test('Idee löschen: nur eigene; offene Anfragen werden abgelehnt', async () => {
  await t.as(LENA);
  await t.db.query(`select public.like_idea($1, null)`, [I_JONAS]);
  await t.as(MIA);
  await assert.rejects(t.db.query(`select public.delete_idea($1)`, [I_JONAS]), code('FORBIDDEN'));
  await t.as(JONAS);
  await t.db.query(`insert into public.ideas (owner_id, emoji, title, description, category, budget, duration, time_of_day, location)
    values ($1, '🎳', 'Bowling-Abend', 'Zwei Runden Bowling, wer verliert zahlt.', 'Sport', '€€', '1–2 Std.', 'Abends', 'Innenstadt')`, [JONAS]);
  await t.db.query(`select public.delete_idea($1)`, [I_JONAS]);
  const idea = await t.one(`select active, deleted_at from public.ideas where id = $1`, [I_JONAS]);
  assert.equal(idea.active, false);
  assert.ok(idea.deleted_at);
  assert.equal((await t.one(`select status from public.likes where idea_id = $1`, [I_JONAS])).status, 'declined');
});

/* ---------- #7 Feed & Likes ---------- */
test('Feed: nur kompatible Personen, ohne „Interessiert an“', async () => {
  await t.as(JONAS);
  const feed = await t.rows(`select * from public.get_feed()`);
  const owners = new Set(feed.map(r => r.owner.id));
  assert.ok(owners.has(MIA) && owners.has(LENA));
  assert.ok(!owners.has(ALEX), 'Alex sucht Männer → nicht kompatibel');
  assert.ok(!owners.has(JONAS), 'keine eigenen Ideen');
  assert.ok(feed.every(r => !('interested_in' in r.owner) && !('birthdate' in r.owner)));
  assert.ok(feed.every(r => typeof r.owner.age === 'number'));
});

test('Liken: Fehlerfälle mit verständlichen Codes', async () => {
  await t.as(JONAS);
  await assert.rejects(t.db.query(`select public.like_idea($1, null)`, [I_ALEX]), code('NOT_COMPATIBLE'));
  const own = (await t.one(`select id from public.ideas where owner_id = $1 and deleted_at is null`, [JONAS])).id;
  await assert.rejects(t.db.query(`select public.like_idea($1, null)`, [own]), code('OWN_IDEA'));
  await t.db.query(`select public.like_idea($1, 'Bin dabei!')`, [I_MIA]);
  await assert.rejects(t.db.query(`select public.like_idea($1, null)`, [I_MIA]), code('DUPLICATE'));
  // gelikte Idee verschwindet aus dem Feed
  assert.ok(!(await t.rows(`select * from public.get_feed()`)).some(r => r.idea.id === I_MIA));
  // ohne eigene aktive Idee kein Liken
  await t.as(ALEX);
  await t.db.query(`update public.ideas set active = false where owner_id = $1`, [ALEX]);
  await assert.rejects(t.db.query(`select public.like_idea($1, null)`, [I_MIA]), code('NEEDS_IDEA'));
});

test('Gesendete Likes: Ablehnung erscheint als „offen“', async () => {
  await t.as(LENA);
  const sent = await t.rows(`select * from public.get_sent_likes()`);
  const onJonas = sent.find(s => s.idea.id === I_JONAS);
  assert.equal(onJonas.status, 'pending', 'abgelehnt (durch Löschen der Idee), aber „offen“');
});

test('Anfrage annehmen: Match + Eröffnungsnachricht, nur einmal, nur durch Empfänger:in', async () => {
  await t.as(MIA);
  const req = await t.one(`select id from public.likes where to_user_id = $1 and from_user_id = $2`, [MIA, JONAS]);
  await t.as(JONAS);
  await assert.rejects(t.db.query(`select public.respond_to_like($1, true)`, [req.id]), code('NOT_FOUND'));
  await t.as(MIA);
  const res = (await t.one(`select public.respond_to_like($1, true) as r`, [req.id])).r;
  assert.equal(res.accepted, true);
  await assert.rejects(t.db.query(`select public.respond_to_like($1, true)`, [req.id]), code('CONFLICT'));
  const msgs = await t.rows(`select sender_id, text, from_like from public.messages where match_id = $1`, [res.matchId]);
  assert.deepEqual(msgs, [{ sender_id: JONAS, text: 'Bin dabei!', from_like: true }]);
  await t.as(JONAS);
  const sent = await t.rows(`select * from public.get_sent_likes()`);
  assert.equal(sent.find(s => s.idea.id === I_MIA).status, 'matched');
  // Mias zweite Idee ist nach dem Match nicht mehr im Feed
  assert.ok(!(await t.rows(`select * from public.get_feed()`)).some(r => r.owner.id === MIA));
});

/* ---------- #8 Chat ---------- */
test('Chat-Übersicht zählt Ungelesenes; mark_as_read setzt es zurück', async () => {
  await t.as(JONAS);
  const matchId = (await t.one(`select id from public.matches`)).id;
  await t.db.query(`insert into public.messages (match_id, sender_id, text) values ($1, $2, 'Wann hast du Zeit?')`, [matchId, JONAS]);
  await t.as(MIA);
  let [s] = await t.rows(`select * from public.get_match_summaries()`);
  assert.equal(s.other_id, JONAS);
  assert.equal(s.unread, 1);
  assert.equal(s.last_message.text, 'Wann hast du Zeit?');
  assert.equal((await t.one(`select public.mark_as_read($1) as c`, [matchId])).c, true);
  [s] = await t.rows(`select * from public.get_match_summaries()`);
  assert.equal(s.unread, 0);
  assert.equal(s.seen, true);
  await t.as(LENA);
  assert.equal((await t.rows(`select * from public.get_match_summaries()`)).length, 0);
  assert.equal((await t.one(`select public.mark_as_read($1) as c`, [matchId])).c, false);
});

test('„schreibt …“-Kanal nur für Match-Beteiligte', async () => {
  await t.as(JONAS);
  const matchId = (await t.one(`select id from public.matches`)).id;
  const topic = 'match:' + matchId;
  const send = () => t.db.query(`insert into realtime.messages (topic, extension, event) values ($1, 'broadcast', 'typing')`, [topic]);
  await t.db.query(`select set_config('realtime.topic', $1, false)`, [topic]);
  await send();
  await t.as(LENA);
  await t.db.query(`select set_config('realtime.topic', $1, false)`, [topic]);
  await assert.rejects(send(), DENIED);
  assert.equal((await t.rows(`select * from realtime.messages`)).length, 0);
  await t.db.query(`select set_config('realtime.topic', 'match:kaputt', false)`);
  assert.equal((await t.rows(`select * from realtime.messages`)).length, 0);
});

/* ---------- #9 Terminvorschläge ---------- */
test('Terminvorschlag beantworten: nur die andere Person, nur einmal', async () => {
  await t.as(JONAS);
  const matchId = (await t.one(`select id from public.matches`)).id;
  await t.db.query(`insert into public.proposals (match_id, proposed_by, date_time) values ($1, $2, now() + interval '3 days')`, [matchId, JONAS]);
  const p = (await t.one(`select id from public.proposals`)).id;
  await assert.rejects(t.db.query(`select public.respond_to_proposal($1, true)`, [p]), code('OWN_PROPOSAL'));
  await t.as(LENA);
  await assert.rejects(t.db.query(`select public.respond_to_proposal($1, true)`, [p]), code('NOT_FOUND'));
  await t.as(MIA);
  const r = (await t.one(`select public.respond_to_proposal($1, true) as r`, [p])).r;
  assert.equal(r.status, 'confirmed');
  await assert.rejects(t.db.query(`select public.respond_to_proposal($1, false)`, [p]), code('CONFLICT'));
  const [s] = await t.rows(`select * from public.get_match_summaries()`);
  assert.ok(s.next_date);
  assert.equal(s.last_proposal.status, 'confirmed');
});
