import { Util, raw, html, icon, logo, CATEGORIES, CAT, BUDGETS, TIMES, DURATIONS, GENDERS, INTEREST_CHOICES, interestKey, CITY_NAMES, INTEREST_TAGS, IDEA_EMOJIS, PHOTO_PRESETS, Label } from './core.js';
import { DataService } from './dataService.js';
import { t, getLang, setLang } from '../i18n/index.js';
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
    b.setAttribute('aria-label', t(show ? 'auth.hidePassword' : 'auth.showPassword'));
  });
}
function authHero() {
  return html`<div class="auth-hero">${logo('lg')}<div class="tagline">${t('auth.tagline')}</div>
    <div class="floaters" aria-hidden="true">
      <div class="floater"><span class="fe" style="--a:#FF6B4A;--b:#FFB25B">🥐</span>${t('auth.floater1')}</div>
      <div class="floater"><span class="fe" style="--a:#E2335B;--b:#FF8A5B">🛶</span>${t('auth.floater2')}</div>
      <div class="floater"><span class="fe" style="--a:#6A4BD8;--b:#C77DDE">🎷</span>${t('auth.floater3')}</div>
    </div></div>`;
}
/** Sprachumschalter für Login/Registrierung (vor dem Einloggen). */
function langSwitch() {
  const other = getLang() === 'de' ? 'en' : 'de';
  return html`<p class="auth-switch"><button type="button" class="link-btn" data-lang="${other}">🌐 ${t('lang.switchTo')}</button></p>`;
}
function bindLangSwitch(root) {
  root.addEventListener('click', e => { const b = e.target.closest('[data-lang]'); if (b) setLang(b.dataset.lang); });
}

const LoginView = {
  async render(el) {
    // Test-Login-Hinweis nur mit npm run dev (im Produktionsbuild ist DataService.dev null)
    const demo = DataService.dev ? DataService.dev.testAccounts()[0] : null;
    el.innerHTML = html`<div class="auth">${authHero()}
      <form class="auth-form" novalidate>
        <h2>${t('auth.welcomeBack')}</h2>
        <p class="sub">${t('auth.loginSub')}</p>
        <div class="field" data-field="email"><label class="label" for="li-email">${t('auth.email')}</label>
          <input id="li-email" class="input" type="email" name="email" autocomplete="username" inputmode="email" placeholder="${t('auth.emailPlaceholder')}"></div>
        <div class="field" data-field="password"><label class="label" for="li-pw">${t('auth.password')}</label>
          <div class="input-wrap"><input id="li-pw" class="input" type="password" name="password" autocomplete="current-password" placeholder="••••••••">
          <button type="button" class="reveal" data-action="reveal" aria-label="${t('auth.showPassword')}">${icon('eye', 20)}</button></div></div>
        <div class="auth-row"><label class="check"><input type="checkbox" name="remember" checked><span class="box">${icon('check', 14, 3)}</span>${t('auth.rememberMe')}</label></div>
        <button class="btn btn-primary btn-block" type="button" data-submit>${t('auth.login')}</button>
        <p class="auth-switch">${t('auth.newHere')} <a href="#/register" class="link-btn">${t('auth.register')}</a></p>
        ${demo ? html`<div class="demo-hint"><span style="font-size:22px" aria-hidden="true">🧪</span>
          <span class="grow"><b>${t('auth.testLogin')}</b> ${demo.email}<br>${t('dev.password')}: ${demo.password}</span>
          <button type="button" class="btn btn-soft btn-xs" data-action="fill">${t('auth.fill')}</button></div>` : ''}
        ${langSwitch()}
      </form></div>`;
    const form = $('form', el);
    bindReveal(form);
    bindLangSwitch(form);
    form.addEventListener('click', e => {
      if (demo && e.target.closest('[data-action="fill"]')) {
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
      if (!Util.isValidEmail(email)) f.email = t('validation.email');
      if (!password) f.password = t('validation.passwordMissing');
      if (Object.keys(f).length) return UI.fieldErrors(form, f);
      UI.busy(btn, true);
      try {
        const user = await DataService.login({ email, password, remember: form.remember.checked });
        UI.toast({ icon: '👋', title: user.name ? t('auth.welcomeName', { name: user.name }) : t('auth.welcome'), light: true, duration: 2400 });
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
      <div class="topbar" style="padding-left:0;margin:0 -8px"><a class="icon-btn" href="#/login" aria-label="${t('auth.backToLogin')}">${icon('back')}</a></div>
      <div style="padding:4px 0 6px">${logo()}</div>
      <form class="auth-form" novalidate>
        <h2>${t('auth.register')}</h2>
        <p class="sub">${t('auth.registerSub')}</p>
        <div class="field" data-field="email"><label class="label" for="re-email">${t('auth.email')}</label>
          <input id="re-email" class="input" type="email" name="email" autocomplete="email" inputmode="email" placeholder="${t('auth.emailPlaceholder')}"></div>
        <div class="field" data-field="password"><label class="label" for="re-pw">${t('auth.password')} <span class="count">${t('auth.passwordHint')}</span></label>
          <div class="input-wrap"><input id="re-pw" class="input" type="password" name="password" autocomplete="new-password" placeholder="••••••••">
          <button type="button" class="reveal" data-action="reveal" aria-label="${t('auth.showPassword')}">${icon('eye', 20)}</button></div>
          <div class="strength" data-level="0" aria-hidden="true"><i></i><i></i><i></i><i></i></div></div>
        <div class="field" data-field="passwordRepeat"><label class="label" for="re-pw2">${t('auth.passwordRepeat')}</label>
          <div class="input-wrap"><input id="re-pw2" class="input" type="password" name="passwordRepeat" autocomplete="new-password" placeholder="••••••••">
          <button type="button" class="reveal" data-action="reveal" aria-label="${t('auth.showPassword')}">${icon('eye', 20)}</button></div></div>
        <button class="btn btn-primary btn-block" type="button" data-submit>${t('auth.register')}</button>
        <p class="legal">${t('auth.registerNote')}</p>
        <p class="auth-switch">${t('auth.haveAccount')} <a href="#/login" class="link-btn">${t('auth.login')}</a></p>
        ${langSwitch()}
      </form></div>`;
    const form = $('form', el);
    bindReveal(form);
    bindLangSwitch(form);
    // Mit E-Mail-Bestätigung (Supabase): Hinweis statt direktem Login
    function showConfirmation(email) {
      $('.auth-form', el).outerHTML = String(html`<div class="auth-form">${UI.empty({ emoji: '📬', title: t('confirmEmail.title'),
        text: t('confirmEmail.text', { email }), actions: [{ label: t('confirmEmail.toLogin'), go: '#/login' }] })}
        <p class="legal">${t('confirmEmail.hint')}</p></div>`);
    }
    const meter = $('.strength', form);
    form.password.addEventListener('input', () => { meter.dataset.level = passwordStrength(form.password.value); });
    bindSubmit(form, async () => {
      const btn = $('[data-submit]', form);
      if (UI.isBusy(btn)) return;
      const data = { email: form.email.value.trim(), password: form.password.value, passwordRepeat: form.passwordRepeat.value };
      const f = {};
      if (!Util.isValidEmail(data.email)) f.email = t('validation.email');
      if (data.password.length < 8) f.password = t('validation.passwordMin');
      if (!data.passwordRepeat) f.passwordRepeat = t('validation.passwordRepeat');
      else if (data.password !== data.passwordRepeat) f.passwordRepeat = t('validation.passwordMismatch');
      if (Object.keys(f).length) return UI.fieldErrors(form, f);
      UI.clearErrors(form);
      UI.busy(btn, true);
      try {
        const res = await DataService.register(data);
        if (res && res.needsConfirmation) { showConfirmation(res.email); return; }
        UI.toast({ icon: '🎉', title: t('auth.registeredTitle'), text: t('auth.registeredText'), light: true });
      } catch (err) {
        UI.busy(btn, false);
        UI.handleError(err, form);
      }
    });
  },
};

/* ---------- Ideen-Editor (Onboarding & „Neue Idee“) ---------- */
// Texte (Titel, Beschreibung, Ort) kommen aus de/en.json unter inspiration.<n>
const INSPIRATION = [
  { emoji: '🥐', category: 'Essen & Trinken', budget: '€€', duration: '2–3 Std.', timeOfDay: 'Morgens' },
  { emoji: '🎳', category: 'Sport', budget: '€€', duration: '1–2 Std.', timeOfDay: 'Abends' },
  { emoji: '🌅', category: 'Outdoor', budget: '€', duration: '1–2 Std.', timeOfDay: 'Abends' },
  { emoji: '🎨', category: 'Kultur', budget: '€€', duration: '2–3 Std.', timeOfDay: 'Abends' },
  { emoji: '🛶', category: 'Abenteuer', budget: '€', duration: '1–2 Std.', timeOfDay: 'Nachmittags' },
  { emoji: '☕', category: 'Essen & Trinken', budget: '€', duration: '2–3 Std.', timeOfDay: 'Nachmittags' },
].map((x, i) => ({ ...x, title: `inspiration.${i}.title`, description: `inspiration.${i}.description`, location: `inspiration.${i}.location` }));
const inspirationIdea = x => ({ ...x, title: t(x.title), description: t(x.description), location: t(x.location) });

const IdeaForm = {
  /** Rendert den Editor in container. Gibt { submit, getData } zurück. */
  mount(container, { idea = null, showInspiration = false, onSubmit }) {
    const st = Object.assign({ title: '', description: '', category: '', budget: '€€', duration: '2–3 Std.', timeOfDay: 'Abends', location: '', emoji: '' }, idea || {});
    const me = App.user || { name: t('ideaForm.you'), age: '', city: '', photos: [] };
    container.innerHTML = html`
      <div class="idea-preview-wrap"><div class="k">${t('ideaForm.preview')}</div><div class="preview-slot"></div></div>
      ${showInspiration ? html`<div class="insp-row"><button type="button" class="btn btn-soft btn-sm" data-insp>${icon('sparkle', 16)} ${t('ideaForm.inspiration')}</button></div>` : ''}
      <form class="idea-form" novalidate>
        <div class="field" data-field="title"><label class="label" for="if-title">${t('ideaForm.title')} <span class="count"></span></label>
          <input id="if-title" class="input" name="title" maxlength="80" placeholder="${t('ideaForm.titlePlaceholder')}" value="${st.title}"></div>
        <div class="field" data-field="description"><label class="label" for="if-desc">${t('ideaForm.description')} <span class="count"></span></label>
          <textarea id="if-desc" class="textarea" name="description" maxlength="300" placeholder="${t('ideaForm.descriptionPlaceholder')}">${st.description}</textarea></div>
        <div class="field" data-field="category"><span class="label">${t('ideaForm.category')}</span>
          <div class="chips">${CATEGORIES.map(c => html`<button type="button" class="chip ${st.category === c.label ? 'is-on' : ''}" data-cat="${c.label}">${c.emoji} ${c.name}</button>`)}</div></div>
        <div class="field" data-field="budget"><span class="label">${t('ideaForm.budget')} <span class="count budget-hint"></span></span>
          <div class="seg">${BUDGETS.map(b => html`<button type="button" class="${st.budget === b.value ? 'is-on' : ''}" data-budget="${b.value}">${b.value} <span style="font-weight:500;opacity:.7">${b.label}</span></button>`)}</div></div>
        <div class="field" data-field="timeOfDay"><span class="label">${t('ideaForm.timeOfDay')}</span>
          <div class="chips">${TIMES.map(x => html`<button type="button" class="chip ${st.timeOfDay === x.value ? 'is-on' : ''}" data-time="${x.value}">${x.emoji} ${x.name}</button>`)}</div></div>
        <div class="field" data-field="duration"><label class="label" for="if-dur">${t('ideaForm.duration')}</label>
          <select id="if-dur" class="select" name="duration">${DURATIONS.map(x => html`<option value="${x}" ${x === st.duration ? raw('selected') : ''}>${Label.duration(x)}</option>`)}</select></div>
        <div class="field" data-field="location"><label class="label" for="if-loc">${t('ideaForm.location')}</label>
          <input id="if-loc" class="input" name="location" maxlength="70" placeholder="${t('ideaForm.locationPlaceholder')}" value="${st.location}"></div>
        <div class="field"><span class="label">${t('ideaForm.symbol')} <span class="count">${t('ideaForm.optional')}</span></span>
          <div class="emoji-pick">${IDEA_EMOJIS.map(e => html`<button type="button" class="${st.emoji === e ? 'is-on' : ''}" data-emoji="${e}" aria-label="${t('ideaForm.symbol')} ${e}">${e}</button>`)}</div></div>
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
        const pool = INSPIRATION.map(inspirationIdea).filter(x => x.title !== st.title);
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
      <div class="ob-top"><button type="button" class="icon-btn" data-ob="back" aria-label="${t('common.back')}">${icon('back')}</button>
        <div class="ob-progress" role="progressbar" aria-valuemin="1" aria-valuemax="${OB_STEPS.length}"><i></i></div><span class="ob-count"></span></div>
      <div class="ob-body"></div>
      <div class="ob-actions"><button type="button" class="btn btn-ghost" data-ob="skip" hidden>${t('onboarding.skip')}</button>
        <button type="button" class="btn btn-primary" style="flex:1" data-ob="next">${t('onboarding.next')}</button></div>
    </div>`;
    const body = $('.ob-body', el);
    const maxBirth = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 18); return Util.isoDate(d); })();
    const minBirth = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 100); return Util.isoDate(d); })();
    const photoKey = p => `${p.colors[0]}|${p.colors[1]}|${p.emoji || ''}|${p.pattern || 0}`;

    function stepHtml(step) {
      switch (step) {
        case 'name': return html`<div class="ob-emoji">👋</div><h2 class="ob-title">${t('onboarding.nameTitle')}</h2>
          <p class="ob-sub">${t('onboarding.nameSub')}</p>
          <div class="field" data-field="name"><label class="sr-only" for="ob-name">${t('onboarding.firstName')}</label>
          <input id="ob-name" class="input big-input" name="name" maxlength="30" autocomplete="given-name" placeholder="${t('onboarding.namePlaceholder')}" value="${data.name}"></div>`;
        case 'birthdate': return html`<div class="ob-emoji">🎂</div><h2 class="ob-title">${t('onboarding.birthTitle')}</h2>
          <p class="ob-sub">${t('onboarding.birthSub')}</p>
          <div class="field" data-field="birthdate"><label class="sr-only" for="ob-birth">${t('onboarding.birthdate')}</label>
          <input id="ob-birth" class="input big-input" type="date" name="birthdate" min="${minBirth}" max="${Util.isoDate(new Date())}" value="${data.birthdate}"></div>
          <div class="age-hint" aria-live="polite"></div>`;
        case 'gender': return html`<div class="ob-emoji">🌈</div><h2 class="ob-title">${t('onboarding.genderTitle')}</h2>
          <div class="field" data-field="gender"><div class="choice-grid">${GENDERS.map(g => html`<button type="button" class="choice ${data.gender === g.value ? 'is-on' : ''}" data-gender="${g.value}"><span class="ce">${g.emoji}</span>${g.label}</button>`)}</div></div>
          <div class="ob-section-label">${t('onboarding.interestedIn')}</div>
          <div class="field" data-field="interestedIn"><div class="choice-grid">${INTEREST_CHOICES.map(c => html`<button type="button" class="choice ${interestKey(data.interestedIn) === c.key ? 'is-on' : ''}" data-interest="${c.key}"><span class="ce">${c.emoji}</span>${c.label}</button>`)}</div></div>`;
        case 'city': return html`<div class="ob-emoji">📍</div><h2 class="ob-title">${t('onboarding.cityTitle')}</h2>
          <p class="ob-sub">${t('onboarding.citySub')}</p>
          <div class="field" data-field="city"><label class="sr-only" for="ob-city">${t('onboarding.city')}</label>
          <input id="ob-city" class="input big-input" name="city" list="ob-cities" maxlength="60" placeholder="${t('onboarding.cityPlaceholder')}" value="${data.city}">
          <datalist id="ob-cities">${CITY_NAMES.map(c => html`<option value="${c}"></option>`)}</datalist></div>
          <div class="chips">${['Frankfurt-Nordend', 'Frankfurt-Sachsenhausen', 'Frankfurt-Bornheim', 'Frankfurt-Bockenheim', 'Offenbach am Main', 'Bad Homburg'].map(c => html`<button type="button" class="chip sm" data-city="${c}">${shortCity(c)}</button>`)}</div>`;
        case 'bio': return html`<div class="ob-emoji">✍️</div><h2 class="ob-title">${t('onboarding.bioTitle')}</h2>
          <p class="ob-sub">${t('onboarding.bioSub')}</p>
          <div class="field" data-field="bio"><label class="label" for="ob-bio">${t('onboarding.aboutMe')} <span class="count">${data.bio.length}/300</span></label>
          <textarea id="ob-bio" class="textarea" name="bio" maxlength="300" style="min-height:120px" placeholder="${t('onboarding.bioPlaceholder')}">${data.bio}</textarea></div>
          <div class="prompt-chips">${[1, 2, 3].map(n => t('onboarding.prompt' + n)).map(p => html`<button type="button" data-prompt="${p}">${p}</button>`)}</div>`;
        case 'interests': return html`<div class="ob-emoji">✨</div><h2 class="ob-title">${t('onboarding.interestsTitle')}</h2>
          <p class="ob-sub">${t('onboarding.interestsSub')} <span class="tag-count">${data.interests.length}/10</span></p>
          <div class="field" data-field="interests"><div class="chips">${INTEREST_TAGS.map(tag => html`<button type="button" class="chip sm ${data.interests.includes(tag) ? 'is-on' : ''}" data-tag="${tag}">${Label.interest(tag)}</button>`)}</div></div>`;
        case 'photos': {
          const sel = data.photos.map(photoKey);
          const options = [...data.photos, ...PHOTO_PRESETS.filter(p => !sel.includes(photoKey(p)))];
          return html`<div class="ob-emoji">📸</div><h2 class="ob-title">${t('onboarding.photosTitle')}</h2>
          <p class="ob-sub">${t('onboarding.photosSub')}</p>
          <div class="field" data-field="photos"><div class="photo-grid">${options.map(p => {
            const i = sel.indexOf(photoKey(p));
            return html`<button type="button" class="photo-option ${i >= 0 ? 'is-on' : ''}" data-photo="${photoKey(p)}" aria-pressed="${i >= 0}">${UI.photoTile(p, data.name)}<span class="sel">${i >= 0 ? i + 1 : ''}</span></button>`;
          })}</div></div>`;
        }
        case 'idea': return html`<div class="ob-emoji">💡</div><h2 class="ob-title">${t('onboarding.ideaTitle')}</h2>
          <p class="ob-sub">${t('onboarding.ideaSub')}</p>
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
      $('[data-ob="next"]', el).textContent = t(step === 'idea' ? 'onboarding.publish' : step === 'photos' ? 'onboarding.finishProfile' : 'onboarding.next');
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
      hint.textContent = age === null ? '' : age < 18 ? t('onboarding.tooYoung') : t('onboarding.age', { age });
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
        if (!data.interests.includes(t.dataset.tag) && data.interests.length >= 10) { UI.toast({ icon: '✋', title: t('onboarding.maxInterests'), light: true, duration: 1800 }); return; }
        toggleIn(data.interests, t.dataset.tag);
        t.classList.toggle('is-on');
        $('.tag-count', body).textContent = `${data.interests.length}/10`;
      }
      if (t.dataset.photo) {
        const key = t.dataset.photo;
        const cur = data.photos.findIndex(p => photoKey(p) === key);
        if (cur >= 0) data.photos.splice(cur, 1);
        else {
          if (data.photos.length >= 3) { UI.toast({ icon: '✋', title: t('onboarding.maxPhotos'), text: t('onboarding.maxPhotosText'), light: true, duration: 2200 }); return; }
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
      if (step === 'gender' && !data.gender) return UI.fieldErrors(body, { gender: t('validation.profile.gender') });
      if (step === 'gender' && !data.interestedIn.length) return UI.fieldErrors(body, { interestedIn: t('validation.profile.interestedIn') });
      if (step === 'photos' && !data.photos.length) return UI.fieldErrors(body, { photos: t('validation.profile.photos') });
      UI.busy(btn, true);
      try {
        if (step === 'idea') {
          await DataService.createIdea(ideaApi.getData());
          await App.refreshUser();
          App.go('#/feed', { replace: true });
          UI.toast({ icon: '🎉', title: t('onboarding.unlockedTitle'), text: t('onboarding.unlockedText'), duration: 5200 });
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
