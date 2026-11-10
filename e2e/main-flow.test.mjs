/* Browser-Test mit zwei Personen in zwei getrennten Browser-Kontexten (wie zwei Handys).
   Start: npm run test:e2e   (sichtbar mitschauen: HEADED=1 npm run test:e2e)
   Nutzt das installierte Google Chrome und das echte Supabase-Projekt aus .env.
   Setzt die Testdaten vorher und nachher mit `db:seed` zurück – also nur gegen das Testprojekt laufen lassen! */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { seedUuid, TEST_PASSWORD } from '../src/js/seed.js';

const ROOT = join(import.meta.dirname, '..');
const JONAS = { email: 'test1@datedate.app', id: seedUuid('u_test1') };
const MIA = { email: 'test2@datedate.app', id: seedUuid('u_test2') };
const REALTIME_MS = 15000; // so lange darf ein Echtzeit-Ereignis brauchen

let server, browser, baseUrl;
const pages = {};
const pageErrors = [];

function db(...args) {
  return execFileSync('node', [join(ROOT, 'scripts', 'db.mjs'), ...args], { cwd: ROOT, encoding: 'utf8' });
}

/** Nur die aktive Ansicht – beim Seitenwechsel blendet die alte noch kurz aus (aria-hidden). */
const view = page => page.locator('section.view:not([aria-hidden])');
/** In der App navigieren und warten, bis die Ansicht (data-view = Routenname) steht. */
async function go(page, hash, name) {
  await page.evaluate(h => { location.hash = h; }, hash);
  await page.locator(`section.view[data-view="${name}"]:not([aria-hidden])`).waitFor();
}

async function openAs(person) {
  const context = await browser.newContext({ locale: 'de-DE', viewport: { width: 420, height: 860 } });
  const page = await context.newPage();
  page.on('pageerror', e => pageErrors.push(`${person.email}: ${e.message}`));
  await page.goto(baseUrl + '#/login');
  await page.fill('#li-email', person.email);
  await page.fill('#li-pw', TEST_PASSWORD);
  await page.click('[data-submit]');
  await page.locator('section.view[data-view="feed"]:not([aria-hidden])').waitFor();
  return page;
}

before(async () => {
  db('seed');
  server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5199, strictPort: false } });
  await server.listen();
  baseUrl = server.resolvedUrls.local[0];
  browser = await chromium.launch({ channel: 'chrome', headless: !process.env.HEADED });
  [pages.jonas, pages.mia] = await Promise.all([openAs(JONAS), openAs(MIA)]);
});

after(async () => {
  await browser?.close();
  await server?.close();
  db('seed');
});

test('Hauptablauf: liken → annehmen → Match → Chat in Echtzeit', { timeout: 90000 }, async () => {
  const { jonas, mia } = pages;

  // Mia likt eine Idee von Jonas (über sein Profil)
  await go(mia, `#/user/${JONAS.id}`, 'user');
  await view(mia).locator('[data-action="like"][data-idea]').first().click();
  await mia.locator('.sheet [data-send]').click();
  await mia.locator('.sheet').waitFor({ state: 'detached' });

  // Jonas sieht die Anfrage und nimmt an
  await go(jonas, '#/requests', 'requests');
  const request = view(jonas).locator('.req-card', { hasText: 'Mia' });
  await request.locator('[data-action="accept"]').click();
  await jonas.locator('.match [data-m="chat"]').click();
  await jonas.waitForURL(/#\/chat\//);

  // Mia bekommt das Match in Echtzeit
  await mia.locator('.match [data-m="chat"]').click({ timeout: REALTIME_MS });
  await mia.waitForURL(/#\/chat\//);
  assert.equal(new URL(mia.url()).hash, new URL(jonas.url()).hash, 'beide im selben Chat');

  // Nachrichten in beide Richtungen
  const hi = `Hallo Mia! (${Date.now()})`;
  await view(jonas).locator('.composer textarea').fill(hi);
  await view(jonas).locator('.composer [data-submit]').click();
  await view(mia).locator('.msg.them .bubble', { hasText: hi }).waitFor({ timeout: REALTIME_MS });

  const reply = `Hi Jonas, gern! (${Date.now()})`;
  await view(mia).locator('.composer textarea').fill(reply);
  await mia.keyboard.press('Enter');
  await view(jonas).locator('.msg.them .bubble', { hasText: reply }).waitFor({ timeout: REALTIME_MS });
});

test('Foto-Upload: erst nach der Freigabe für andere sichtbar, Löschen entfernt die Datei', { timeout: 90000 }, async () => {
  const { jonas, mia } = pages;
  const fileCount = () => Number(JSON.parse(db('query', `select count(*) as n from storage.objects where bucket_id = 'photos' and name like '${JONAS.id}/%'`, '--json'))[0].n);

  // Testbild im Browser erzeugen (PNG, 1800 × 2400 – größer als die 1280-px-Grenze)
  const png = await jonas.evaluate(() => {
    const c = Object.assign(document.createElement('canvas'), { width: 1800, height: 2400 });
    const g = c.getContext('2d');
    g.fillStyle = '#ff5e7e'; g.fillRect(0, 0, 1800, 2400);
    g.fillStyle = '#fff'; g.font = 'bold 400px sans-serif'; g.fillText('asap', 320, 1300);
    return c.toDataURL('image/png').split(',')[1];
  });

  await go(jonas, '#/profile/edit', 'profile-edit');
  await view(jonas).locator('[data-file]').setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await view(jonas).locator('.upload-item .pill.gray').waitFor(); // „In Prüfung“
  assert.equal(fileCount(), 1, 'Datei liegt im Storage');
  const size = await view(jonas).locator('.upload-item img').evaluate(img => img.decode().then(() => [img.naturalWidth, img.naturalHeight]));
  assert.deepEqual(size, [960, 1280], 'auf 1280 px verkleinert');

  // Vor der Prüfung: Mia sieht nur den Platzhalter
  await go(mia, `#/user/${JONAS.id}`, 'user');
  await view(mia).locator('.gallery').waitFor();
  assert.equal(await view(mia).locator('.gallery img').count(), 0, 'kein echtes Foto vor der Freigabe');

  // Freigabe wie im Dashboard
  db('query', `update public.photos set status = 'approved' where owner_id = '${JONAS.id}'`);
  await go(mia, '#/feed', 'feed');
  await go(mia, `#/user/${JONAS.id}`, 'user');
  const shown = view(mia).locator('.gallery img').first();
  await shown.waitFor();
  assert.ok(await shown.evaluate(img => img.decode().then(() => img.naturalWidth > 0)), 'Bild lädt für Mia');

  // Löschen: Eintrag und Datei weg
  await go(jonas, '#/profile', 'profile');
  await go(jonas, '#/profile/edit', 'profile-edit');
  await view(jonas).locator('.upload-item .pill.green').waitFor(); // „Freigegeben“
  await view(jonas).locator('[data-del]').click();
  await jonas.locator('.dialog [data-res="1"]').click();
  await view(jonas).locator('.upload-item').waitFor({ state: 'detached' });
  assert.equal(fileCount(), 0, 'Datei gelöscht');
});

test('Keine JavaScript-Fehler in den Seiten', () => {
  assert.deepEqual(pageErrors, []);
});
