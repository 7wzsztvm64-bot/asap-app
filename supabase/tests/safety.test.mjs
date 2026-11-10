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
