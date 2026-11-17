/* Tests für Phase 3 – Web-Beta (Issues #22 ff.). Start mit `npm run test:db`. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, DENIED } from './setup.mjs';

let t;

/** Registrierung wie über Supabase Auth (Insert in auth.users mit Metadaten aus signUp) */
async function signUp(id, meta = {}) {
  await t.asAdmin();
  return t.one(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3) returning raw_user_meta_data`,
    [id, `${id.slice(-4)}@example.org`, JSON.stringify(meta)]);
}
const uid = n => `00000000-0000-0000-0000-0000000004${String(n).padStart(2, '0')}`;

before(async () => {
  t = await createTestDb();
});

/* ---------- #22 Einladungscodes ---------- */
test('Einladungscodes: ohne Pflicht ist die Registrierung offen', async () => {
  await t.asAnon();
  assert.equal((await t.one(`select public.invite_required() as r`)).r, false);
  await signUp(uid(1));
});

test('Einladungscodes: mit Pflicht nur mit gültigem Code, Nutzungen begrenzt, Code wird nicht gespeichert', async () => {
  await t.asAdmin();
  await t.db.exec(`update moderation.config set invite_required = true;
    insert into moderation.invite_codes (code, max_uses) values ('FFM-BETA-1', 2);
    insert into moderation.invite_codes (code, expires_at) values ('ALT-CODE-1', now() - interval '1 day');`);

  await t.asAnon();
  assert.equal((await t.one(`select public.invite_required() as r`)).r, true);
  assert.equal((await t.one(`select public.check_invite_code(' ffm-beta-1 ') as ok`)).ok, true, 'Groß-/Kleinschreibung egal');
  assert.equal((await t.one(`select public.check_invite_code('FALSCH') as ok`)).ok, false);
  assert.equal((await t.one(`select public.check_invite_code('ALT-CODE-1') as ok`)).ok, false, 'abgelaufen');

  await assert.rejects(signUp(uid(2)), /INVITE_INVALID/, 'ohne Code');
  await assert.rejects(signUp(uid(3), { invite_code: 'FALSCH' }), /INVITE_INVALID/);
  await assert.rejects(signUp(uid(4), { invite_code: 'ALT-CODE-1' }), /INVITE_INVALID/);

  const row = await signUp(uid(5), { invite_code: 'ffm-beta-1', other: 'bleibt' });
  assert.deepEqual(row.raw_user_meta_data, { other: 'bleibt' }, 'Code aus den Metadaten entfernt');
  await signUp(uid(6), { invite_code: 'FFM-BETA-1' });
  await assert.rejects(signUp(uid(7), { invite_code: 'FFM-BETA-1' }), /INVITE_INVALID/, 'max_uses erreicht');
  await t.asAdmin();
  assert.equal((await t.one(`select uses from moderation.invite_codes where code = 'FFM-BETA-1'`)).uses, 2);
  assert.equal((await t.rows(`select 1 from auth.users where id = any($1)`, [[uid(2), uid(3), uid(4), uid(7)]])).length, 0);
  await t.db.exec(`update moderation.config set invite_required = false`);
});

test('Einladungscodes: Codes sind über die API nicht lesbar', async () => {
  for (const who of ['anon', 'user']) {
    if (who === 'anon') await t.asAnon(); else await t.as(uid(1));
    await assert.rejects(t.db.query(`select * from moderation.invite_codes`), DENIED);
    await assert.rejects(t.db.query(`update moderation.config set invite_required = false`), DENIED);
  }
});
