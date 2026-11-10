/* Tests für Phase 2 – Sicherheit & Pflichtfunktionen (Issues #13–#16, #19). Start mit `npm run test:db`. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, DENIED } from './setup.mjs';

const JONAS = '00000000-0000-0000-0000-0000000000a2';
const MIA = '00000000-0000-0000-0000-0000000000b2';
const LENA = '00000000-0000-0000-0000-0000000000c2';
const I_JONAS = '10000000-0000-0000-0000-0000000000a2';
const I_MIA = '10000000-0000-0000-0000-0000000000b2';
const I_LENA = '10000000-0000-0000-0000-0000000000c2';
const MATCH = '20000000-0000-0000-0000-0000000000a2';

let t;
const code = re => new RegExp(re);

before(async () => {
  t = await createTestDb();
  await t.createUser(JONAS, { name: 'Jonas', gender: 'mann', interested_in: ['frau'] });
  await t.createUser(MIA, { name: 'Mia', gender: 'frau', interested_in: ['mann'] });
  await t.createUser(LENA, { name: 'Lena', gender: 'frau', interested_in: ['mann'] });
  await t.createIdea(I_JONAS, JONAS);
  await t.createIdea(I_MIA, MIA);
  await t.createIdea(I_LENA, LENA);
  await t.asAdmin();
  await t.db.query(`insert into public.matches (id, user1_id, user2_id, idea_id) values ($1, $2, $3, $4)`, [MATCH, MIA, JONAS, I_MIA]);
  await t.db.query(`insert into public.messages (match_id, sender_id, text) values ($1, $2, 'Hi Mia'), ($1, $3, 'Hi Jonas')`, [MATCH, JONAS, MIA]);
  await t.db.query(`insert into public.proposals (match_id, proposed_by, date_time) values ($1, $2, now() + interval '2 days')`, [MATCH, JONAS]);
  // Lena hat Jonas' Idee angefragt (offen)
  await t.db.query(`insert into public.likes (from_user_id, to_user_id, idea_id) values ($1, $2, $3)`, [LENA, JONAS, I_JONAS]);
});

/* ---------- #13 Blockieren ---------- */
test('Blockieren: Match, Chat und Termine verschwinden für beide – und kommen nach dem Aufheben zurück', async () => {
  const visible = async who => {
    await t.as(who);
    return {
      matches: (await t.rows(`select id from public.matches`)).length,
      messages: (await t.rows(`select id from public.messages`)).length,
      proposals: (await t.rows(`select id from public.proposals`)).length,
      summaries: (await t.rows(`select * from public.get_match_summaries()`)).length,
    };
  };
  assert.deepEqual(await visible(JONAS), { matches: 1, messages: 2, proposals: 1, summaries: 1 });

  await t.as(MIA);
  await t.db.query(`insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [MIA, JONAS]);
  const none = { matches: 0, messages: 0, proposals: 0, summaries: 0 };
  assert.deepEqual(await visible(JONAS), none, 'Jonas sieht nichts mehr');
  assert.deepEqual(await visible(MIA), none, 'Mia sieht nichts mehr');

  await t.as(JONAS);
  await assert.rejects(t.db.query(`insert into public.messages (match_id, sender_id, text) values ($1, $2, 'Hallo?')`, [MATCH, JONAS]), DENIED);
  assert.equal((await t.one(`select public.mark_as_read($1) as c`, [MATCH])).c, false);
  assert.equal((await t.rows(`select * from public.get_public_profiles($1)`, [[MIA]])).length, 0);
  assert.ok(!(await t.rows(`select * from public.get_feed()`)).some(r => r.owner.id === MIA));

  await t.as(MIA);
  await t.db.query(`delete from public.blocks where blocker_id = $1 and blocked_id = $2`, [MIA, JONAS]);
  assert.deepEqual(await visible(JONAS), { matches: 1, messages: 2, proposals: 1, summaries: 1 }, 'nach dem Aufheben wieder da');
});

test('Blockieren: offene Anfragen der blockierten Person verschwinden', async () => {
  await t.as(JONAS);
  assert.equal((await t.rows(`select id from public.likes`)).length, 1);
  await t.db.query(`insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [JONAS, LENA]);
  assert.equal((await t.rows(`select id from public.likes`)).length, 0);
  await t.db.query(`delete from public.blocks where blocked_id = $1`, [LENA]);
});

test('Liste „Blockierte Personen“: nur die eigenen, mit Namen', async () => {
  await t.as(MIA);
  await t.db.query(`insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [MIA, JONAS]);
  const mine = await t.rows(`select * from public.get_blocked_users()`);
  assert.deepEqual(mine.map(r => r.name), ['Jonas']);
  assert.ok(mine[0].photo, 'erstes Profilbild dabei');
  await t.as(JONAS);
  assert.equal((await t.rows(`select * from public.get_blocked_users()`)).length, 0, 'Jonas sieht nicht, dass er blockiert ist');
  await t.as(MIA);
  await t.db.query(`delete from public.blocks where blocker_id = $1`, [MIA]);
});

/* ---------- #14 Melden ---------- */
test('Melden: speichert Grund und blockiert gleich mit', async () => {
  await t.as(JONAS);
  await t.db.query(`select public.report_user($1, 'harassment', 'Schreibt unangenehme Dinge', null, $2, true)`, [MIA, MATCH]);
  assert.equal((await t.rows(`select * from public.reports`)).length, 0, 'eigene Meldungen sind nicht lesbar');
  assert.equal((await t.rows(`select id from public.matches`)).length, 0, 'nach dem Melden blockiert');
  await t.asAdmin();
  const [r] = await t.rows(`select reporter_id, reported_id, reason, details, match_id, status from public.reports`);
  assert.deepEqual(r, { reporter_id: JONAS, reported_id: MIA, reason: 'harassment', details: 'Schreibt unangenehme Dinge', match_id: MATCH, status: 'open' });
  const [o] = await t.rows(`select reported_name, reporter_name, reports_against_person from moderation.open_reports`);
  assert.equal(o.reported_name, 'Mia');
  assert.equal(Number(o.reports_against_person), 1);
  await t.db.exec(`delete from public.blocks; delete from public.reports;`);
});

test('Melden: ungültiger Grund, sich selbst, fremder Kontext und anon werden abgelehnt', async () => {
  await t.as(JONAS);
  await assert.rejects(t.db.query(`select public.report_user($1, 'langweilig')`, [MIA]), code('VALIDATION'));
  await assert.rejects(t.db.query(`select public.report_user($1, 'spam')`, [JONAS]), code('NOT_FOUND'));
  await assert.rejects(t.db.query(`select public.report_user($1, 'spam', null, $2)`, [MIA, I_LENA]), code('NOT_FOUND'));
  await assert.rejects(t.db.query(`select public.report_user($1, 'spam', null, null, $2)`, [LENA, MATCH]), code('NOT_FOUND'));
  await t.asAnon();
  await assert.rejects(t.db.query(`select public.report_user($1, 'spam')`, [MIA]), DENIED);
  await assert.rejects(t.db.query(`select * from moderation.open_reports`), DENIED);
  await t.as(JONAS);
  await assert.rejects(t.db.query(`select * from moderation.open_reports`), DENIED);
});

test('Melden: höchstens 10 Meldungen pro Tag', async () => {
  await t.as(LENA);
  for (let i = 0; i < 10; i++) await t.db.query(`select public.report_user($1, 'spam', null, null, null, false)`, [i % 2 ? JONAS : MIA]);
  await assert.rejects(t.db.query(`select public.report_user($1, 'spam', null, null, null, false)`, [MIA]), code('RATE_LIMIT'));
  await t.asAdmin();
  await t.db.query(`delete from public.reports`);
});

/* ---------- #19 Missbrauchsschutz ---------- */
test('Missbrauchsschutz: 20 Nachrichten pro Minute', async () => {
  await t.as(MIA);
  for (let i = 0; i < 19; i++) await t.db.query(`insert into public.messages (match_id, sender_id, text) values ($1, $2, $3)`, [MATCH, MIA, 'Nachricht ' + i]);
  await assert.rejects(t.db.query(`insert into public.messages (match_id, sender_id, text) values ($1, $2, 'zu viel')`, [MATCH, MIA]), code('MESSAGE_LIMIT'));
  await t.asAdmin();
  await t.db.query(`delete from public.messages where sender_id = $1 and text like 'Nachricht %'`, [MIA]);
});

test('Missbrauchsschutz: 50 Likes pro Tag, 3 offene Terminvorschläge pro Match', async () => {
  await t.asAdmin();
  // 50 Likes von Lena innerhalb der letzten 24 Std. simulieren (auf Hilfs-Ideen von Jonas)
  for (let i = 0; i < 50; i++) {
    const id = `30000000-0000-0000-0000-${String(i).padStart(12, '0')}`;
    await t.db.query(`insert into public.ideas (id, owner_id, emoji, title, description, category, budget, duration, time_of_day, location, deleted_at, created_at)
      values ($1, $2, '🎭', 'Hilfsidee Nummer', 'Nur für den Test der Obergrenze.', 'Kultur', '€', '1–2 Std.', 'Abends', 'Frankfurt', now(), now() - interval '2 days')`, [id, MIA]);
    await t.db.query(`insert into public.likes (from_user_id, to_user_id, idea_id, status) values ($1, $2, $3, 'declined')`, [JONAS, MIA, id]);
  }
  await t.as(JONAS);
  await assert.rejects(t.db.query(`select public.like_idea($1, null)`, [I_LENA]), code('LIKE_LIMIT'));
  await t.asAdmin();
  await t.db.query(`delete from public.ideas where title = 'Hilfsidee Nummer'`);

  await t.as(JONAS);
  for (let i = 1; i <= 2; i++) await t.db.query(`insert into public.proposals (match_id, proposed_by, date_time) values ($1, $2, now() + interval '${i + 3} days')`, [MATCH, JONAS]);
  await assert.rejects(t.db.query(`insert into public.proposals (match_id, proposed_by, date_time) values ($1, $2, now() + interval '9 days')`, [MATCH, JONAS]), code('PROPOSAL_LIMIT'));
  await t.asAdmin();
  await t.db.query(`delete from public.proposals where proposed_by = $1 and date_time > now() + interval '3 days'`, [JONAS]);
});

/* ---------- #16 Daten herunterladen ---------- */
test('Datenexport: eigene Daten vollständig, keine Nachrichten anderer', async () => {
  await t.as(JONAS);
  const { d } = await t.one(`select public.export_my_data() as d`);
  assert.equal(d.profile.name, 'Jonas');
  assert.equal(d.ideas.length, 1);
  assert.equal(d.matches.length, 1);
  assert.equal(d.matches[0].with, 'Mia');
  assert.deepEqual(d.messagesSent.map(m => m.text), ['Hi Mia'], 'nur eigene Nachrichten');
  assert.equal(d.dateProposals.length, 1);
  assert.equal(d.dateProposals[0].proposedByMe, true);
  assert.equal(d.likesReceived.length, 1, 'Lenas Anfrage');
  assert.ok(!JSON.stringify(d).includes('Hi Jonas'), 'Mias Nachricht fehlt');
  assert.ok(!JSON.stringify(d).includes('interested_in') || d.profile.interested_in, 'eigenes „Interessiert an“ ist dabei');
});

/* ---------- #15 Konto löschen ---------- */
test('Konto löschen: keine Zeile mit der Nutzer-ID bleibt übrig, Meldungen ohne Personenbezug', async () => {
  await t.as(LENA);
  await t.db.query(`select public.report_user($1, 'spam', null, null, null, true)`, [JONAS]);
  await t.db.query(`insert into public.passes (user_id, idea_id) values ($1, $2)`, [LENA, I_MIA]);
  await t.as(JONAS);
  await t.db.query(`select public.delete_my_account()`);
  await t.asAdmin();
  const leftovers = await t.one(`select
    (select count(*) from auth.users where id = $1) as users,
    (select count(*) from public.profiles where id = $1) as profiles,
    (select count(*) from public.ideas where owner_id = $1) as ideas,
    (select count(*) from public.likes where $1 in (from_user_id, to_user_id)) as likes,
    (select count(*) from public.matches where $1 in (user1_id, user2_id)) as matches,
    (select count(*) from public.messages where sender_id = $1) as messages,
    (select count(*) from public.proposals where proposed_by = $1) as proposals,
    (select count(*) from public.passes where user_id = $1) as passes,
    (select count(*) from public.blocks where $1 in (blocker_id, blocked_id)) as blocks,
    (select count(*) from public.reports where $1 in (reporter_id, reported_id)) as reports`, [JONAS]);
  assert.ok(Object.values(leftovers).every(n => Number(n) === 0), JSON.stringify(leftovers));
  assert.equal((await t.rows(`select * from public.reports where reported_id is null and reason = 'spam'`)).length, 1, 'Meldung bleibt anonymisiert');
  assert.equal((await t.rows(`select * from public.messages where match_id = $1`, [MATCH])).length, 0, 'gemeinsamer Chat ist weg');
  await t.asAnon();
  await assert.rejects(t.db.query(`select public.delete_my_account()`), DENIED);
});
