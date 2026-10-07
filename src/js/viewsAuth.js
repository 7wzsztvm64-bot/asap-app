import { Util, raw, html, icon, logo, CATEGORIES, CAT, BUDGETS, TIMES, DURATIONS, GENDERS, INTEREST_CHOICES, interestKey, CITY_NAMES, INTEREST_TAGS, IDEA_EMOJIS } from './core.js';
import { DataService } from './dataService.js';
import { $, $$, shortCity, bindSubmit, toggleIn, UI, App } from './uiCore.js';

/* =============================================================================
   ANSICHTEN: Login, Registrierung, Onboarding, Ideen-Editor
   ============================================================================= */
function passwordStrength(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 12) s++;
  return pw ? Math.max(1, s) : 0;
}
function bindReveal(root) {
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-action="reveal"]');
    if (!b) return;
    const input = b.parentElement.querySelector('input');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    b.innerHTML = String(icon(show ? 'eyeOff' : 'eye', 20));
    b.setAttribute('aria-label', show ? 'Passwort verbergen' : 'Passwort anzeigen');
  });
}
function authHero() {
  return html`<div class="auth-hero">${logo('lg')}<div class="tagline">Erst die Idee. Dann das Date.</div>
    <div class="floaters" aria-hidden="true">
      <div class="floater"><span class="fe" style="--a:#FF6B4A;--b:#FFB25B">🥐</span>Sonntagsbrunch am Main</div>
      <div class="floater"><span class="fe" style="--a:#E2335B;--b:#FF8A5B">🛶</span>Kanutour auf der Lahn</div>
      <div class="floater"><span class="fe" style="--a:#6A4BD8;--b:#C77DDE">🎷</span>Jazzkeller-Abend</div>
    </div></div>`;
}

const LoginView = {
  async render(el) {
    el.innerHTML = html`<div class="auth">${authHero()}
      <form class="auth-form" novalidate>
        <h2>Willkommen zurück</h2>
        <p class="sub">Melde dich an und schau, wer bei deinen Ideen dabei ist.</p>
        <div class="field" data-field="email"><label class="label" for="li-email">E-Mail</label>
          <input id="li-email" class="input" type="email" name="email" autocomplete="username" inputmode="email" placeholder="du@beispiel.de"></div>
        <div class="field" data-field="password"><label class="label" for="li-pw">Passwort</label>
          <div class="input-wrap"><input id="li-pw" class="input" type="password" name="password" autocomplete="current-password" placeholder="••••••••">
          <button type="button" class="reveal" data-action="reveal" aria-label="Passwort anzeigen">${icon('eye', 20)}</button></div></div>
        <div class="auth-row"><label class="check"><input type="checkbox" name="remember" checked><span class="box">${icon('check', 14, 3)}</span>Eingeloggt bleiben</label></div>
        <button class="btn btn-primary btn-block" type="button" data-submit>Anmelden</button>
        <p class="auth-switch">Neu bei asap? <a href="#/register" class="link-btn">Konto erstellen</a></p>
        <div class="demo-hint"><span style="font-size:22px" aria-hidden="true">🧪</span>
          <span class="grow"><b>Test-Login:</b> test1@datedate.app<br>Passwort: Test1234</span>
          <button type="button" class="btn btn-soft btn-xs" data-action="fill">Ausfüllen</button></div>
      </form></div>`;
    const form = $('form', el);
    bindReveal(form);
    form.addEventListener('click', e => {
      if (e.target.closest('[data-action="fill"]')) {
        const demo = DataService.dev.testAccounts()[0];
        form.email.value = demo.email;
        form.password.value = demo.password;
        UI.clearErrors(form);
      }
    });
    bindSubmit(form, async () => {
      const btn = $('[data-submit]', form);
      if (UI.isBusy(btn)) return;
      UI.clearErrors(form);
      const email = form.email.value.trim(), password = form.password.value;
      const f = {};
      if (!Util.isValidEmail(email)) f.email = 'Bitte gib eine gültige E-Mail-Adresse ein.';
      if (!password) f.password = 'Bitte gib dein Passwort ein.';
      if (Object.keys(f).length) return UI.fieldErrors(form, f);
      UI.busy(btn, true);
      try {
        const user = await DataService.login({ email, password, remember: form.remember.checked });
        UI.toast({ icon: '👋', title: `Schön, dass du da bist${user.name ? ', ' + user.name : ''}!`, light: true, duration: 2400 });
      } catch (err) {
        UI.busy(btn, false);
        UI.handleError(err, form);
        form.password.select();
      }
    });
  },
};

const RegisterView = {
  async render(el) {
    el.innerHTML = html`<div class="auth">
      <div class="topbar" style="padding-left:0;margin:0 -8px"><a class="icon-btn" href="#/login" aria-label="Zurück zum Login">${icon('back')}</a></div>
      <div style="padding:4px 0 6px">${logo()}</div>
      <form class="auth-form" novalidate>
        <h2>Konto erstellen</h2>
        <p class="sub">In zwei Minuten startklar – danach legst du deine erste Date-Idee an.</p>
        <div class="field" data-field="email"><label class="label" for="re-email">E-Mail</label>
          <input id="re-email" class="input" type="email" name="email" autocomplete="email" inputmode="email" placeholder="du@beispiel.de"></div>
        <div class="field" data-field="password"><label class="label" for="re-pw">Passwort <span class="count">mind. 8 Zeichen</span></label>
          <div class="input-wrap"><input id="re-pw" class="input" type="password" name="password" autocomplete="new-password" placeholder="••••••••">
          <button type="button" class="reveal" data-action="reveal" aria-label="Passwort anzeigen">${icon('eye', 20)}</button></div>
          <div class="strength" data-level="0" aria-hidden="true"><i></i><i></i><i></i><i></i></div></div>
        <div class="field" data-field="passwordRepeat"><label class="label" for="re-pw2">Passwort wiederholen</label>
          <div class="input-wrap"><input id="re-pw2" class="input" type="password" name="passwordRepeat" autocomplete="new-password" placeholder="••••••••">
          <button type="button" class="reveal" data-action="reveal" aria-label="Passwort anzeigen">${icon('eye', 20)}</button></div></div>
        <button class="btn btn-primary btn-block" type="button" data-submit>Konto erstellen</button>
        <p class="legal">Prototyp: Bitte keine echten Passwörter verwenden. Alle Daten bleiben lokal in deinem Browser.</p>
        <p class="auth-switch">Schon dabei? <a href="#/login" class="link-btn">Anmelden</a></p>
      </form></div>`;
    const form = $('form', el);
    bindReveal(form);
    const meter = $('.strength', form);
    form.password.addEventListener('input', () => { meter.dataset.level = passwordStrength(form.password.value); });
    bindSubmit(form, async () => {
      const btn = $('[data-submit]', form);
      if (UI.isBusy(btn)) return;
      const data = { email: form.email.value.trim(), password: form.password.value, passwordRepeat: form.passwordRepeat.value };
      const f = {};
      if (!Util.isValidEmail(data.email)) f.email = 'Bitte gib eine gültige E-Mail-Adresse ein.';
      if (data.password.length < 8) f.password = 'Das Passwort muss mindestens 8 Zeichen lang sein.';
      if (!data.passwordRepeat) f.passwordRepeat = 'Bitte wiederhole dein Passwort.';
      else if (data.password !== data.passwordRepeat) f.passwordRepeat = 'Die Passwörter stimmen nicht überein.';
      if (Object.keys(f).length) return UI.fieldErrors(form, f);
      UI.clearErrors(form);
      UI.busy(btn, true);
      try {
        await DataService.register(data);
        UI.toast({ icon: '🎉', title: 'Willkommen bei asap!', text: 'Erzähl uns kurz etwas über dich.', light: true });
      } catch (err) {
        UI.busy(btn, false);
        UI.handleError(err, form);
      }
    });
  },
};

/* ---------- Ideen-Editor (Onboarding & „Neue Idee“) ---------- */
const INSPIRATION = [
  { emoji: '🥐', title: 'Sonntagsbrunch im Café Wacker, danach Spaziergang am Main', category: 'Essen & Trinken', budget: '€€', duration: '2–3 Std.', timeOfDay: 'Morgens', location: 'Café Wacker, Innenstadt',
    description: 'Frisch gerösteter Kaffee, ein ausgiebiges Frühstück und danach ein Spaziergang über den Eisernen Steg mit Blick auf die Skyline.' },
  { emoji: '🎳', title: 'Bowling-Duell mit Pommes-Wetteinsatz', category: 'Sport', budget: '€€', duration: '1–2 Std.', timeOfDay: 'Abends', location: 'Bowlingcenter, Innenstadt',
    description: 'Zwei Runden Bowling – wer verliert, zahlt die Pommes. Talent ist ausdrücklich keine Voraussetzung.' },
  { emoji: '🌅', title: 'Picknick zum Sonnenuntergang am Lohrberg', category: 'Outdoor', budget: '€', duration: '1–2 Std.', timeOfDay: 'Abends', location: 'Lohrberg, Seckbach',
    description: 'Decke, Käse, Trauben und eine Flasche Apfelwein-Schorle – dazu der schönste Blick auf die Skyline, den Frankfurt zu bieten hat.' },
  { emoji: '🎨', title: 'Malen & Wein: Wir porträtieren uns gegenseitig', category: 'Kultur', budget: '€€', duration: '2–3 Std.', timeOfDay: 'Abends', location: 'Atelier-Bar, Nordend',
    description: 'Leinwand, Pinsel, ein Glas Wein – und die Aufgabe, den anderen zu malen. Lachen garantiert, Kunstwerk eher nicht.' },
  { emoji: '🛶', title: 'Ruderboot fahren am Jacobiweiher', category: 'Abenteuer', budget: '€', duration: '1–2 Std.', timeOfDay: 'Nachmittags', location: 'Jacobiweiher, Stadtwald',
    description: 'Eine Runde rudern, Enten beobachten und herausfinden, wer von uns besser steuern kann. Danach Waffeln im Waldcafé?' },
  { emoji: '☕', title: 'Kaffee-Tasting: Drei Röstereien, ein Urteil', category: 'Essen & Trinken', budget: '€', duration: '2–3 Std.', timeOfDay: 'Nachmittags', location: 'Röstereien in Bornheim & Nordend',
    description: 'Wir testen drei Röstereien und vergeben strenge Noten für Crema, Kuchen und Atmosphäre. Gewinner bekommt einen zweiten Besuch.' },
];

const IdeaForm = {
  /** Rendert den Editor in container. Gibt { submit, getData } zurück. */
  mount(container, { idea = null, showInspiration = false, onSubmit }) {
    const st = Object.assign({ title: '', description: '', category: '', budget: '€€', duration: '2–3 Std.', timeOfDay: 'Abends', location: '', emoji: '' }, idea || {});
    const me = App.user || { name: 'Du', age: '', city: '', photos: [] };
    container.innerHTML = html`
      <div class="idea-preview-wrap"><div class="k">Vorschau – so sehen andere deine Idee</div><div class="preview-slot"></div></div>
      ${showInspiration ? html`<div class="insp-row"><button type="button" class="btn btn-soft btn-sm" data-insp>${icon('sparkle', 16)} Inspiration einfügen</button></div>` : ''}
      <form class="idea-form" novalidate>
        <div class="field" data-field="title"><label class="label" for="if-title">Titel <span class="count"></span></label>
          <input id="if-title" class="input" name="title" maxlength="80" placeholder="z. B. Sonntagsbrunch im Café Wacker, danach Spaziergang am Main" value="${st.title}"></div>
        <div class="field" data-field="description"><label class="label" for="if-desc">Beschreibung <span class="count"></span></label>
          <textarea id="if-desc" class="textarea" name="description" maxlength="300" placeholder="Was genau macht ihr? Was macht die Idee besonders?">${st.description}</textarea></div>
        <div class="field" data-field="category"><span class="label">Kategorie</span>
          <div class="chips">${CATEGORIES.map(c => html`<button type="button" class="chip ${st.category === c.label ? 'is-on' : ''}" data-cat="${c.label}">${c.emoji} ${c.label}</button>`)}</div></div>
        <div class="field" data-field="budget"><span class="label">Budget <span class="count budget-hint"></span></span>
          <div class="seg">${BUDGETS.map(b => html`<button type="button" class="${st.budget === b.value ? 'is-on' : ''}" data-budget="${b.value}">${b.value} <span style="font-weight:500;opacity:.7">${b.label}</span></button>`)}</div></div>
        <div class="field" data-field="timeOfDay"><span class="label">Tageszeit</span>
          <div class="chips">${TIMES.map(t => html`<button type="button" class="chip ${st.timeOfDay === t.value ? 'is-on' : ''}" data-time="${t.value}">${t.emoji} ${t.value}</button>`)}</div></div>
        <div class="field" data-field="duration"><label class="label" for="if-dur">Dauer</label>
          <select id="if-dur" class="select" name="duration">${DURATIONS.map(x => html`<option value="${x}" ${x === st.duration ? raw('selected') : ''}>${x}</option>`)}</select></div>
        <div class="field" data-field="location"><label class="label" for="if-loc">Ort / Treffpunkt</label>
          <input id="if-loc" class="input" name="location" maxlength="70" placeholder="z. B. Café Wacker, Kornmarkt" value="${st.location}"></div>
        <div class="field"><span class="label">Symbol <span class="count">optional</span></span>
          <div class="emoji-pick">${IDEA_EMOJIS.map(e => html`<button type="button" class="${st.emoji === e ? 'is-on' : ''}" data-emoji="${e}" aria-label="Symbol ${e}">${e}</button>`)}</div></div>
      </form>`;
    const form = $('form', container);
    const preview = $('.preview-slot', container);
    const counts = () => {
      $('[data-field="title"] .count', form).textContent = `${st.title.length}/80`;
      $('[data-field="description"] .count', form).textContent = `${st.description.length}/300`;
      const b = BUDGETS.find(x => x.value === st.budget);
      $('.budget-hint', form).textContent = b ? b.hint : '';
    };
    const renderPreview = () => {
      preview.innerHTML = UI.ideaCard({ idea: { ...st, category: st.category || 'Essen & Trinken', emoji: st.emoji || (CAT[st.category] || {}).emoji || '💡' }, owner: me, distanceKm: null }, { variant: 'preview' });
      counts();
    };
    // Hinweis: form.elements.namedItem statt form.title (form.title wäre das title-Attribut des Formulars)
    const fld = n => form.elements.namedItem(n);
    const syncInputs = () => {
      fld('title').value = st.title; fld('description').value = st.description; fld('location').value = st.location; fld('duration').value = st.duration;
      $$('[data-cat]', form).forEach(b => b.classList.toggle('is-on', b.dataset.cat === st.category));
      $$('[data-budget]', form).forEach(b => b.classList.toggle('is-on', b.dataset.budget === st.budget));
      $$('[data-time]', form).forEach(b => b.classList.toggle('is-on', b.dataset.time === st.timeOfDay));
      $$('[data-emoji]', form).forEach(b => b.classList.toggle('is-on', b.dataset.emoji === st.emoji));
    };
    form.addEventListener('input', e => {
      const n = e.target.name;
      if (n && n in st) { st[n] = e.target.value; renderPreview(); }
    });
    form.addEventListener('change', e => { if (e.target.name === 'duration') { st.duration = e.target.value; renderPreview(); } });
    container.addEventListener('click', e => {
      const t = e.target.closest('[data-cat],[data-budget],[data-time],[data-emoji],[data-insp]');
      if (!t) return;
      if (t.dataset.cat) st.category = t.dataset.cat;
      if (t.dataset.budget) st.budget = t.dataset.budget;
      if (t.dataset.time) st.timeOfDay = t.dataset.time;
      if (t.dataset.emoji) st.emoji = st.emoji === t.dataset.emoji ? '' : t.dataset.emoji;
      if (t.hasAttribute('data-insp')) {
        const pool = INSPIRATION.filter(x => x.title !== st.title);
        Object.assign(st, Util.pick(pool));
        UI.clearErrors(form);
      }
      syncInputs();
      renderPreview();
    });
    bindSubmit(form, () => api.submit());
    renderPreview();
    const api = {
      form,
      getData: () => ({ ...st }),
      submit: () => onSubmit({ ...st }, form),
    };
    return api;
  },
};

/* ---------- Onboarding in Schritten ---------- */
const OB_STEPS = ['name', 'birthdate', 'gender', 'city', 'bio', 'interests', 'photos', 'idea'];
const OnboardingView = {
  async render(el, params, ctx) {
    const u = App.user;
    const data = {
      name: u.name || '', birthdate: u.birthdate || '', gender: u.gender || '', interestedIn: u.interestedIn || [], city: u.city || '',
      bio: u.bio || '', interests: [...(u.interests || [])], photos: (u.photos || []).map(p => ({ ...p })),
    };
    let idx = u.profileComplete ? OB_STEPS.length - 1 : Util.clamp(u.onboardingStep || 0, 0, OB_STEPS.length - 2);
    let ideaApi = null;
    el.innerHTML = html`<div class="ob">
      <div class="ob-top"><button type="button" class="icon-btn" data-ob="back" aria-label="Zurück">${icon('back')}</button>
        <div class="ob-progress" role="progressbar" aria-valuemin="1" aria-valuemax="${OB_STEPS.length}"><i></i></div><span class="ob-count"></span></div>
      <div class="ob-body"></div>
      <div class="ob-actions"><button type="button" class="btn btn-ghost" data-ob="skip" hidden>Überspringen</button>
        <button type="button" class="btn btn-primary" style="flex:1" data-ob="next">Weiter</button></div>
    </div>`;
    const body = $('.ob-body', el);
    const maxBirth = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 18); return Util.isoDate(d); })();
    const minBirth = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 100); return Util.isoDate(d); })();
    const photoKey = p => `${p.colors[0]}|${p.colors[1]}|${p.emoji || ''}|${p.pattern || 0}`;

    function stepHtml(step) {
      switch (step) {
        case 'name': return html`<div class="ob-emoji">👋</div><h2 class="ob-title">Wie heißt du?</h2>
          <p class="ob-sub">Dein Vorname steht auf deinen Date-Ideen. Nachnamen brauchen wir nicht.</p>
          <div class="field" data-field="name"><label class="sr-only" for="ob-name">Vorname</label>
          <input id="ob-name" class="input big-input" name="name" maxlength="30" autocomplete="given-name" placeholder="Dein Vorname" value="${data.name}"></div>`;
        case 'birthdate': return html`<div class="ob-emoji">🎂</div><h2 class="ob-title">Wann hast du Geburtstag?</h2>
          <p class="ob-sub">Auf deinem Profil zeigen wir nur dein Alter. Du musst mindestens 18 Jahre alt sein.</p>
          <div class="field" data-field="birthdate"><label class="sr-only" for="ob-birth">Geburtsdatum</label>
          <input id="ob-birth" class="input big-input" type="date" name="birthdate" min="${minBirth}" max="${Util.isoDate(new Date())}" value="${data.birthdate}"></div>
          <div class="age-hint" aria-live="polite"></div>`;
        case 'gender': return html`<div class="ob-emoji">🌈</div><h2 class="ob-title">Ich bin …</h2>
          <div class="field" data-field="gender"><div class="choice-grid">${GENDERS.map(g => html`<button type="button" class="choice ${data.gender === g.value ? 'is-on' : ''}" data-gender="${g.value}"><span class="ce">${g.emoji}</span>${g.label}</button>`)}</div></div>
          <div class="ob-section-label">Ich interessiere mich für …</div>
          <div class="field" data-field="interestedIn"><div class="choice-grid">${INTEREST_CHOICES.map(c => html`<button type="button" class="choice ${interestKey(data.interestedIn) === c.key ? 'is-on' : ''}" data-interest="${c.key}"><span class="ce">${c.emoji}</span>${c.label}</button>`)}</div></div>`;
        case 'city': return html`<div class="ob-emoji">📍</div><h2 class="ob-title">Wo wohnst du?</h2>
          <p class="ob-sub">Damit wir dir Ideen in deiner Nähe zeigen. Ein Stadtteil reicht völlig.</p>
          <div class="field" data-field="city"><label class="sr-only" for="ob-city">Stadt oder Stadtteil</label>
          <input id="ob-city" class="input big-input" name="city" list="ob-cities" maxlength="60" placeholder="z. B. Frankfurt-Nordend" value="${data.city}">
          <datalist id="ob-cities">${CITY_NAMES.map(c => html`<option value="${c}"></option>`)}</datalist></div>
          <div class="chips">${['Frankfurt-Nordend', 'Frankfurt-Sachsenhausen', 'Frankfurt-Bornheim', 'Frankfurt-Bockenheim', 'Offenbach am Main', 'Bad Homburg'].map(c => html`<button type="button" class="chip sm" data-city="${c}">${shortCity(c)}</button>`)}</div>`;
        case 'bio': return html`<div class="ob-emoji">✍️</div><h2 class="ob-title">Erzähl was über dich</h2>
          <p class="ob-sub">Zwei, drei Sätze reichen. Was sollte man über dich wissen, bevor man mit dir loszieht?</p>
          <div class="field" data-field="bio"><label class="label" for="ob-bio">Über mich <span class="count">${data.bio.length}/300</span></label>
          <textarea id="ob-bio" class="textarea" name="bio" maxlength="300" style="min-height:120px" placeholder="z. B. Kaffee-Nerd, Sonntagsläuferin, immer für Flohmärkte zu haben …">${data.bio}</textarea></div>
          <div class="prompt-chips">${['Ein perfekter Sonntag beginnt für mich mit …', 'Ich kann stundenlang reden über …', 'Mein Geheimtipp in Frankfurt: …'].map(p => html`<button type="button" data-prompt="${p}">${p}</button>`)}</div>`;
        case 'interests': return html`<div class="ob-emoji">✨</div><h2 class="ob-title">Was magst du?</h2>
          <p class="ob-sub">Wähle 3 bis 10 Interessen – gemeinsame zeigen wir anderen hervorgehoben. <span class="tag-count">${data.interests.length}/10</span></p>
          <div class="field" data-field="interests"><div class="chips">${INTEREST_TAGS.map(t => html`<button type="button" class="chip sm ${data.interests.includes(t) ? 'is-on' : ''}" data-tag="${t}">${t}</button>`)}</div></div>`;
        case 'photos': {
          const sel = data.photos.map(photoKey);
          const options = [...data.photos, ...PHOTO_PRESETS.filter(p => !sel.includes(photoKey(p)))];
          return html`<div class="ob-emoji">📸</div><h2 class="ob-title">Deine Profilbilder</h2>
          <p class="ob-sub">Im Prototyp nutzen wir farbige Platzhalter statt echter Fotos. Wähle 1 bis 3 – das erste ist dein Hauptbild.</p>
          <div class="field" data-field="photos"><div class="photo-grid">${options.map(p => {
            const i = sel.indexOf(photoKey(p));
            return html`<button type="button" class="photo-option ${i >= 0 ? 'is-on' : ''}" data-photo="${photoKey(p)}" aria-pressed="${i >= 0}">${UI.photoTile(p, data.name)}<span class="sel">${i >= 0 ? i + 1 : ''}</span></button>`;
          })}</div></div>`;
        }
        case 'idea': return html`<div class="ob-emoji">💡</div><h2 class="ob-title">Deine erste Date-Idee</h2>
          <p class="ob-sub">Was würdest du gern mit jemandem unternehmen? Sobald deine Idee steht, wird dein Feed freigeschaltet.</p>
          <div class="idea-slot"></div>`;
        default: return '';
      }
    }

    function show(newIdx, back = false) {
      idx = newIdx;
      const step = OB_STEPS[idx];
      $('.ob-progress i', el).style.width = `${((idx + 1) / OB_STEPS.length) * 100}%`;
      $('.ob-progress', el).setAttribute('aria-valuenow', idx + 1);
      $('.ob-count', el).textContent = `${idx + 1} / ${OB_STEPS.length}`;
      $('[data-ob="back"]', el).style.visibility = (idx === 0 || (step === 'idea' && u.profileComplete && !data._fromSteps)) ? 'hidden' : 'visible';
      $('[data-ob="skip"]', el).hidden = step !== 'bio';
      $('[data-ob="next"]', el).textContent = step === 'idea' ? 'Idee veröffentlichen & loslegen' : step === 'photos' ? 'Profil fertigstellen' : 'Weiter';
      body.innerHTML = html`<div class="ob-step ${back ? 'back' : ''}">${stepHtml(step)}</div>`;
      body.scrollTop = 0;
      if (step === 'idea') ideaApi = IdeaForm.mount($('.idea-slot', body), { showInspiration: true, onSubmit: () => next() });
      if (step === 'birthdate') updateAge();
      const inp = $('input.big-input, textarea', body);
      if (inp && window.matchMedia('(min-width: 521px)').matches) setTimeout(() => inp.focus({ preventScroll: true }), 300);
    }
    function updateAge() {
      const hint = $('.age-hint', body);
      if (!hint) return;
      const age = Util.ageFrom(data.birthdate);
      hint.textContent = age === null ? '' : age < 18 ? 'Du musst mindestens 18 sein. 🙈' : `Du bist ${age} Jahre alt.`;
    }

    body.addEventListener('input', e => {
      const n = e.target.name;
      if (!n || !(n in data) || OB_STEPS[idx] === 'idea') return;
      data[n] = e.target.value;
      if (n === 'birthdate') updateAge();
      if (n === 'bio') $('.count', body).textContent = `${data.bio.length}/300`;
      UI.clearErrors(body);
    });
    body.addEventListener('click', e => {
      const t = e.target.closest('[data-gender],[data-interest],[data-city],[data-prompt],[data-tag],[data-photo]');
      if (!t) return;
      UI.clearErrors(body);
      if (t.dataset.gender) { data.gender = t.dataset.gender; $$('[data-gender]', body).forEach(b => b.classList.toggle('is-on', b === t)); }
      if (t.dataset.interest) { data.interestedIn = INTEREST_CHOICES.find(c => c.key === t.dataset.interest).value.slice(); $$('[data-interest]', body).forEach(b => b.classList.toggle('is-on', b === t)); }
      if (t.dataset.city) { data.city = t.dataset.city; $('input[name="city"]', body).value = data.city; }
      if (t.dataset.prompt) {
        const ta = $('textarea', body);
        data.bio = (data.bio ? data.bio.trim() + ' ' : '') + t.dataset.prompt.replace(/…$/, '').trim() + ' ';
        ta.value = data.bio.slice(0, 300); data.bio = ta.value;
        $('.count', body).textContent = `${data.bio.length}/300`;
        ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
      }
      if (t.dataset.tag) {
        if (!data.interests.includes(t.dataset.tag) && data.interests.length >= 10) { UI.toast({ icon: '✋', title: 'Maximal 10 Interessen', light: true, duration: 1800 }); return; }
        toggleIn(data.interests, t.dataset.tag);
        t.classList.toggle('is-on');
        $('.tag-count', body).textContent = `${data.interests.length}/10`;
      }
      if (t.dataset.photo) {
        const key = t.dataset.photo;
        const cur = data.photos.findIndex(p => photoKey(p) === key);
        if (cur >= 0) data.photos.splice(cur, 1);
        else {
          if (data.photos.length >= 3) { UI.toast({ icon: '✋', title: 'Maximal 3 Bilder', text: 'Tippe ein ausgewähltes Bild an, um es zu entfernen.', light: true, duration: 2200 }); return; }
          const src = [...(u.photos || []), ...PHOTO_PRESETS].find(p => photoKey(p) === key);
          data.photos.push({ ...src });
        }
        $$('[data-photo]', body).forEach(b => {
          const i = data.photos.findIndex(p => photoKey(p) === b.dataset.photo);
          b.classList.toggle('is-on', i >= 0);
          b.setAttribute('aria-pressed', i >= 0);
          $('.sel', b).textContent = i >= 0 ? i + 1 : '';
        });
      }
    });
    body.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.matches('input.big-input') && !e.target.list) { e.preventDefault(); next(); }
    });

    function patchFor(step) {
      switch (step) {
        case 'name': return { name: data.name };
        case 'birthdate': return { birthdate: data.birthdate };
        case 'gender': return { gender: data.gender, interestedIn: data.interestedIn };
        case 'city': return { city: data.city };
        case 'bio': return { bio: data.bio };
        case 'interests': return { interests: data.interests };
        case 'photos': return { photos: data.photos };
        default: return {};
      }
    }
    async function next(skip = false) {
      const btn = $('[data-ob="next"]', el);
      if (UI.isBusy(btn)) return;
      const step = OB_STEPS[idx];
      UI.clearErrors(body);
      // schnelle Prüfung im Client – der DataService validiert zusätzlich
      if (step === 'gender' && !data.gender) return UI.fieldErrors(body, { gender: 'Bitte wähle eine Option.' });
      if (step === 'gender' && !data.interestedIn.length) return UI.fieldErrors(body, { interestedIn: 'Bitte wähle, für wen du dich interessierst.' });
      if (step === 'photos' && !data.photos.length) return UI.fieldErrors(body, { photos: 'Wähle mindestens ein Profilbild.' });
      UI.busy(btn, true);
      try {
        if (step === 'idea') {
          await DataService.createIdea(ideaApi.getData());
          await App.refreshUser();
          App.go('#/feed', { replace: true });
          UI.toast({ icon: '🎉', title: 'Dein Feed ist freigeschaltet!', text: 'Psst … schau mal in deine Anfragen.', onClick: () => App.go('#/requests'), duration: 5200 });
          return;
        }
        const patch = skip ? { bio: '' } : patchFor(step);
        App.user = await DataService.updateProfile({ ...patch, onboardingStep: idx + 1 });
        if (step === 'photos') App.user = await DataService.completeOnboarding();
        if (!ctx.alive) return;
        UI.busy(btn, false);
        data._fromSteps = true;
        show(idx + 1);
      } catch (err) {
        if (!ctx.alive) return;
        UI.busy(btn, false);
        UI.handleError(err, step === 'idea' ? ideaApi.form : body);
      }
    }
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-ob]');
      if (!b) return;
      if (b.dataset.ob === 'next') next();
      if (b.dataset.ob === 'skip') next(true);
      if (b.dataset.ob === 'back' && idx > 0) show(idx - 1, true);
    });
    show(idx);
  },
};

export { passwordStrength, bindReveal, authHero, LoginView, RegisterView, INSPIRATION, IdeaForm, OB_STEPS, OnboardingView };
