/* Tests für Phase 3 – Web-Beta (Issues #22 ff.). Start mit `npm run test:db`. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, DENIED } from './setup.mjs';

let t;

/** Registrierung wie über Supabase Auth (Insert in auth.users mit Metadaten aus signUp) */
async function signUp(id, meta = { terms_version: 'test' }) {
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

  await assert.rejects(signUp(uid(2), { terms_version: 'test' }), /INVITE_INVALID/, 'ohne Code');
  const tv = { terms_version: 'test' };
  await assert.rejects(signUp(uid(3), { ...tv, invite_code: 'FALSCH' }), /INVITE_INVALID/);
  await assert.rejects(signUp(uid(4), { ...tv, invite_code: 'ALT-CODE-1' }), /INVITE_INVALID/);

  const row = await signUp(uid(5), { ...tv, invite_code: 'ffm-beta-1' });
  assert.deepEqual(row.raw_user_meta_data, tv, 'Code aus den Metadaten entfernt');
  await signUp(uid(6), { ...tv, invite_code: 'FFM-BETA-1' });
  await assert.rejects(signUp(uid(7), { ...tv, invite_code: 'FFM-BETA-1' }), /INVITE_INVALID/, 'max_uses erreicht');
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

/* ---------- #23 Zustimmung & Einwilligung ---------- */
test('Zustimmung: Registrierung nur mit Nutzungsregeln-Version, Profil merkt sich Version und Zeitpunkt', async () => {
  await assert.rejects(signUp(uid(10), {}), /TERMS_REQUIRED/);
  await signUp(uid(11), { terms_version: '2026-11-beta' });
  await t.as(uid(11));
  const p = await t.one(`select terms_version, terms_accepted_at, sensitive_consent_at from public.profiles where id = $1`, [uid(11)]);
  assert.equal(p.terms_version, '2026-11-beta');
  assert.ok(p.terms_accepted_at);
  assert.equal(p.sensitive_consent_at, null);
});

test('Einwilligung: „Interessiert an“ erst nach Einwilligung, Zeitpunkt nicht selbst setzbar', async () => {
  await t.as(uid(11));
  await assert.rejects(t.db.query(`update public.profiles set interested_in = '{mann}' where id = $1`, [uid(11)]), /CONSENT_REQUIRED/);
  await assert.rejects(t.db.query(`update public.profiles set sensitive_consent_at = now() where id = $1`, [uid(11)]), DENIED);
  await t.db.query(`select public.give_sensitive_consent()`);
  await t.db.query(`update public.profiles set interested_in = '{mann}' where id = $1`, [uid(11)]);
  await t.asAnon();
  await assert.rejects(t.db.query(`select public.give_sensitive_consent()`), DENIED);
});

test('Einwilligung widerrufen: Angabe gelöscht, Profil für andere unsichtbar bis zur neuen Einwilligung', async () => {
  const A = uid(20), B = uid(21);
  await t.createUser(A, { name: 'Alex', gender: 'mann', interested_in: ['frau'] });
  await t.createUser(B, { name: 'Bea', gender: 'frau', interested_in: ['mann'] });
  await t.as(B);
  assert.equal((await t.rows(`select id from public.get_public_profiles($1)`, [[A]])).length, 1);

  await t.as(A);
  await t.db.query(`select public.withdraw_sensitive_consent()`);
  const p = await t.one(`select interested_in, sensitive_consent_at, profile_complete, onboarding_step from public.profiles where id = $1`, [A]);
  assert.deepEqual(p.interested_in, []);
  assert.equal(p.sensitive_consent_at, null);
  assert.equal(p.profile_complete, false);
  await assert.rejects(t.db.query(`update public.profiles set interested_in = '{frau}' where id = $1`, [A]), /CONSENT_REQUIRED/);
  await t.as(B);
  assert.equal((await t.rows(`select id from public.get_public_profiles($1)`, [[A]])).length, 0, 'unsichtbar');
});
