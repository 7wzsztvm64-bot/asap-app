/* Tests für den Foto-Upload mit Prüfung (Issue #18). Start mit `npm run test:db`. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, DENIED } from './setup.mjs';

const JONAS = '00000000-0000-0000-0000-0000000000a3';
const MIA = '00000000-0000-0000-0000-0000000000b3';
const LENA = '00000000-0000-0000-0000-0000000000c3';
const I_JONAS = '10000000-0000-0000-0000-0000000000a3';
const file = (owner, n) => `${owner}/00000000-0000-4000-8000-${String(n).padStart(12, '0')}.jpg`;

let t;

/** Datei hochladen wie über die Storage-API (Insert in storage.objects unter RLS) */
async function upload(who, path) {
  await t.as(who);
  await t.db.query(`insert into storage.objects (bucket_id, name, owner) values ('photos', $1, $2)`, [path, who]);
}
async function addPhoto(who, path, position = 0) {
  await upload(who, path);
  return (await t.one(`insert into public.photos (owner_id, path, position) values ($1, $2, $3) returning *`, [who, path, position]));
}
async function canSeeFile(who, path) {
  await t.as(who);
  return (await t.rows(`select name from storage.objects where bucket_id = 'photos' and name = $1`, [path])).length === 1;
}
async function cardPhotos(who, of) {
  await t.as(who);
  const [row] = await t.rows(`select photos from public.get_public_profiles($1)`, [[of]]);
  return row.photos;
}

before(async () => {
  t = await createTestDb();
  await t.createUser(JONAS, { name: 'Jonas', gender: 'mann', interested_in: ['frau'] });
  await t.createUser(MIA, { name: 'Mia', gender: 'frau', interested_in: ['mann'] });
  await t.createUser(LENA, { name: 'Lena', gender: 'frau', interested_in: ['mann'] });
  await t.createIdea(I_JONAS, JONAS);
});

test('Fotos: neue Fotos warten auf Prüfung – andere sehen weder Datei noch Eintrag', async () => {
  const ph = await addPhoto(JONAS, file(JONAS, 1));
  assert.equal(ph.status, 'pending');

  assert.ok(await canSeeFile(JONAS, ph.path), 'eigene Datei sichtbar');
  assert.equal(await canSeeFile(MIA, ph.path), false, 'fremde, ungeprüfte Datei unsichtbar');
  await t.as(MIA);
  assert.equal((await t.rows(`select id from public.photos`)).length, 0, 'fremde Einträge unsichtbar');

  // Profilkarte: andere sehen weiter den Platzhalter, Jonas selbst sein wartendes Foto
  assert.ok((await cardPhotos(MIA, JONAS))[0].colors, 'Platzhalter für Mia');
  assert.equal((await cardPhotos(JONAS, JONAS))[0].status, 'pending');
  await t.as(MIA);
  const [feed] = await t.rows(`select owner from public.get_feed() where (owner ->> 'id')::uuid = $1`, [JONAS]);
  assert.ok(feed.owner.photos[0].colors, 'Feed zeigt den Platzhalter');
});

test('Fotos: nach der Freigabe sichtbar, nach Ablehnung nicht – Blockierung sperrt die Datei', async () => {
  await t.as(JONAS);
  const [ph] = await t.rows(`select * from public.photos where owner_id = $1`, [JONAS]);

  await t.asAdmin();
  const approved = await t.one(`update public.photos set status = 'approved' where id = $1 returning reviewed_at`, [ph.id]);
  assert.ok(approved.reviewed_at, 'Prüfzeitpunkt gesetzt');

  assert.ok(await canSeeFile(MIA, ph.path), 'freigegeben → sichtbar');
  assert.equal((await cardPhotos(MIA, JONAS))[0].path, ph.path);
  await t.as(MIA);
  const [feed] = await t.rows(`select owner from public.get_feed() where (owner ->> 'id')::uuid = $1`, [JONAS]);
  assert.equal(feed.owner.photos[0].path, ph.path, 'Feed zeigt das echte Foto');

  await t.as(MIA);
  await t.db.query(`insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [MIA, JONAS]);
  assert.equal(await canSeeFile(MIA, ph.path), false, 'blockiert → Datei gesperrt');
  assert.equal(await canSeeFile(JONAS, file(MIA, 9)), false);
  await t.db.query(`delete from public.blocks where blocker_id = $1`, [MIA]);

  await t.asAdmin();
  await t.db.query(`update public.photos set status = 'rejected' where id = $1`, [ph.id]);
  assert.equal(await canSeeFile(LENA, ph.path), false, 'abgelehnt → unsichtbar');
  assert.ok((await cardPhotos(LENA, JONAS))[0].colors, 'wieder Platzhalter');
  assert.ok((await cardPhotos(JONAS, JONAS))[0].colors, 'abgelehnte Fotos auch für Jonas nicht auf der Karte');
});

test('Fotos: Status lässt sich nicht selbst setzen, fremde Ordner und Austausch sind gesperrt', async () => {
  await t.as(MIA);
  await assert.rejects(t.db.query(`insert into public.photos (owner_id, path, status) values ($1, $2, 'approved')`, [MIA, file(MIA, 1)]), DENIED);
  await assert.rejects(t.db.query(`insert into public.photos (owner_id, path) values ($1, $2)`, [JONAS, file(JONAS, 5)]), DENIED);
  await assert.rejects(t.db.query(`insert into public.photos (owner_id, path) values ($1, $2)`, [MIA, file(JONAS, 5)]), /photos_path_in_own_folder/);
  await assert.rejects(t.db.query(`insert into public.photos (owner_id, path) values ($1, $2)`, [MIA, `${MIA}/../x.jpg`]), /photos_path_in_own_folder/);

  const ph = await addPhoto(MIA, file(MIA, 2));
  await t.as(MIA);
  await assert.rejects(t.db.query(`update public.photos set status = 'approved' where id = $1`, [ph.id]), DENIED);
  await t.db.query(`update public.photos set position = 1 where id = $1`, [ph.id]);

  // Datei in fremden Ordner hochladen / anderes Format / freigegebene Datei austauschen
  await assert.rejects(upload(MIA, file(JONAS, 7)), DENIED);
  await assert.rejects(upload(MIA, `${MIA}/bild.png`), DENIED);
  await t.as(MIA);
  assert.equal((await t.db.query(`update storage.objects set owner = null where name = $1`, [ph.path])).affectedRows, 0, 'kein Update möglich');
  // Fremde Dateien lassen sich nicht löschen
  await t.as(MIA);
  assert.equal((await t.db.query(`delete from storage.objects where name = $1`, [file(JONAS, 1)])).affectedRows, 0);
  await t.asAdmin();
  assert.equal((await t.rows(`select 1 from storage.objects where name = $1`, [file(JONAS, 1)])).length, 1);
});

test('Fotos: höchstens 3 Dateien und 3 Einträge pro Person', async () => {
  await addPhoto(LENA, file(LENA, 1), 0);
  await addPhoto(LENA, file(LENA, 2), 1);
  await addPhoto(LENA, file(LENA, 3), 2);
  await assert.rejects(upload(LENA, file(LENA, 4)), DENIED, 'vierte Datei abgelehnt');
  await t.asAdmin();
  await t.db.query(`insert into storage.objects (bucket_id, name) values ('photos', $1)`, [file(LENA, 4)]);
  await t.as(LENA);
  await assert.rejects(t.db.query(`insert into public.photos (owner_id, path) values ($1, $2)`, [LENA, file(LENA, 4)]), /PHOTO_LIMIT/);

  // Löschen gibt den Platz wieder frei
  await t.db.query(`delete from storage.objects where name = $1`, [file(LENA, 3)]);
  await t.db.query(`delete from public.photos where path = $1`, [file(LENA, 3)]);
  await t.asAdmin();
  await t.db.query(`delete from storage.objects where name = $1`, [file(LENA, 4)]);
  await addPhoto(LENA, file(LENA, 5), 2);
});

test('Fotos: Export enthält eigene Fotos, Moderation sieht Wartende, Konto löschen entfernt Einträge', async () => {
  await t.as(LENA);
  const { d } = await t.one(`select public.export_my_photos() as d`);
  assert.equal(d.length, 3);
  assert.ok(d.every(p => p.path.startsWith(LENA)));

  await t.asAdmin();
  const pending = await t.rows(`select owner_name from moderation.pending_photos`);
  assert.ok(pending.some(p => p.owner_name === 'Lena'));
  await t.as(LENA);
  await assert.rejects(t.db.query(`select * from moderation.pending_photos`), DENIED);

  await t.db.query(`select public.delete_my_account()`);
  await t.asAdmin();
  assert.equal((await t.rows(`select 1 from public.photos where owner_id = $1`, [LENA])).length, 0);
});
