import { Util, raw, html, icon, GENDERS, GENDER, INTEREST_CHOICES, interestKey, CITY_NAMES, INTEREST_TAGS, PHOTO_PRESETS, Label } from './core.js';
import { DataService } from './dataService.js';
import { $, $$, shortCity, toggleIn, UI, App } from './uiCore.js';
import { IdeaForm } from './viewsAuth.js';
import { t, getLang, setLang, LANGS } from '../i18n/index.js';

/* =============================================================================
   ANSICHTEN: Eigenes Profil, Profil bearbeiten, Idee anlegen/bearbeiten
   ============================================================================= */
const ProfileView = {
  async render(el, params, ctx) {
    el.innerHTML = html`<header class="topbar"><h1>${t('tabs.profile')}</h1>
      <div class="actions"><button type="button" class="icon-btn" data-action="preview" aria-label="${t('profile.previewAria')}">${icon('eye')}</button>
      <button type="button" class="icon-btn" data-go="#/profile/edit" aria-label="${t('profile.edit')}">${icon('edit')}</button></div></header>
      <div class="scroll"><div class="pad body">${UI.loading()}</div></div>`;
    const body = $('.body', el);
    let me = null, ideas = [], sig = '';

    function ideaRow(i) {
      return html`<div class="idea-row ${i.active ? '' : 'paused'}" data-idea="${i.id}">
        <div class="ir-top">${UI.ideaThumb(i)}<div style="flex:1;min-width:0"><div class="ir-title">${i.title}</div>
          <div class="ir-sub">${i.active ? html`<span class="pill green">${t('profile.active')}</span>` : html`<span class="pill gray">${t('profile.paused')}</span>`}
            <span>${Label.category(i.category)} · ${i.budget}</span>
            ${i.pendingLikes ? html`<span class="pill primary">${t(i.pendingLikes === 1 ? 'profile.requestsOne' : 'profile.requestsMany', { n: i.pendingLikes })}</span>` : ''}
            ${i.matchCount ? html`<span class="pill plum">${t(i.matchCount === 1 ? 'profile.matchesOne' : 'profile.matchesMany', { n: i.matchCount })}</span>` : ''}</div></div></div>
        <div class="ir-actions">
          <button type="button" class="btn btn-secondary btn-xs" data-go="#/ideas/${i.id}/edit">${icon('edit', 15)} ${t('profile.editIdea')}</button>
          <button type="button" class="btn btn-secondary btn-xs" data-action="toggle-idea" data-id="${i.id}" data-active="${i.active ? 1 : 0}">${i.active ? html`${icon('pause', 15)} ${t('profile.pause')}` : html`${icon('play', 15)} ${t('profile.activate')}`}</button>
          <button type="button" class="btn btn-danger btn-xs" style="flex:0 0 auto" data-action="delete-idea" data-id="${i.id}" aria-label="${t('profile.deleteIdea')}">${icon('trash', 15)}</button>
        </div></div>`;
    }
    function render() {
      const activeCount = ideas.filter(i => i.active).length;
      body.innerHTML = html`
        <div class="profile-hero">${UI.photoTile(me.photos[0], me.name)}
          <div class="ph-overlay"><div class="ph-name">${me.name}, ${me.age}</div><div class="ph-sub">${icon('pin', 15)} ${me.city}</div></div></div>
        <div class="row-actions"><button type="button" class="btn btn-secondary btn-sm" data-go="#/profile/edit">${icon('edit', 16)} ${t('profile.edit')}</button>
          <button type="button" class="btn btn-secondary btn-sm" data-action="preview">${icon('eye', 16)} ${t('profile.preview')}</button></div>
        <p class="bio ${me.bio ? '' : 'empty-bio'}">${me.bio || t('profile.noBio')}</p>
        <div class="chips">${me.interests.map(tag => html`<span class="tag">${Label.interest(tag)}</span>`)}</div>
        <div class="section-title">${t('profile.myIdeas', { n: ideas.length })}<button type="button" class="btn btn-soft btn-xs" data-go="#/ideas/new">${icon('plus', 15)} ${t('profile.newIdea')}</button></div>
        ${ideas.length && !activeCount ? html`<div class="banner"><div class="bt">${icon('info', 18)} ${t('profile.allPaused')}</div><span style="font-size:13.5px;color:var(--ink-2)">${t('profile.allPausedText')}</span></div>` : ''}
        ${ideas.length ? ideas.map(ideaRow) : UI.empty({ emoji: '💡', title: t('profile.noIdeaTitle'), text: t('profile.noIdeaText'), actions: [{ label: t('feed.createIdea'), go: '#/ideas/new', icon: 'plus' }] })}
        <div class="section-title">${t('profile.account')}</div>
        <div class="settings-list">
          <div class="si">${icon('mail', 20)}<span class="grow">${t('auth.email')}</span><span class="val">${me.email}</span></div>
          <button type="button" class="si" data-go="#/profile/blocked">${icon('ban', 20)}<span class="grow">${t('blocked.title')}</span>${icon('chevronRight', 18)}</button>
          <div class="si">🌐<span class="grow">${t('lang.label')}</span><span class="seg" style="flex:none">${LANGS.map(l => html`<button type="button" class="${l === getLang() ? 'is-on' : ''}" data-lang="${l}" aria-pressed="${l === getLang()}">${t('lang.' + l)}</button>`)}</span></div>
          ${DevPanel.enabled ? html`<button type="button" class="si" data-action="dev">${icon('gear', 20)}<span class="grow">${t('dev.title')}</span>${icon('chevronRight', 18)}</button>` : ''}
          <button type="button" class="si danger" data-action="logout">${icon('logout', 20)}<span class="grow">${t('profile.logout')}</span></button>
        </div>
        <p class="foot-note">${t('profile.version')}<br>${t('profile.storage')}</p>`;
    }
    async function load(silent = false) {
      try {
        const [u, list] = await Promise.all([DataService.getCurrentUser(), DataService.getMyIdeas()]);
        if (!ctx.alive) return;
        if (!u) return App.onUnauthorized();
        App.user = u;
        const s = JSON.stringify([u, list]);
        if (silent && s === sig) return;
        sig = s; me = u; ideas = list;
        render();
      } catch (err) {
        if (!ctx.alive) return;
        if (err.code === 'UNAUTHORIZED') return App.onUnauthorized();
        body.innerHTML = UI.errorState(err);
      }
    }
    el.addEventListener('click', async e => {
      const langBtn = e.target.closest('[data-lang]');
      if (langBtn) { setLang(langBtn.dataset.lang); return; } // App zeichnet sich danach neu
      const btn = e.target.closest('[data-action]');
      if (!btn || UI.isBusy(btn)) return;
      switch (btn.dataset.action) {
        case 'retry': return load();
        case 'preview': return App.go('#/user/' + App.user.id);
        case 'dev': return DevPanel.toggle(true);
        case 'logout': {
          const ok = await UI.confirm({ icon: '👋', title: t('profile.logoutTitle'), text: t('profile.logoutText'), confirmLabel: t('profile.logout') });
          if (!ok) return;
          UI.busy(btn, true);
          try { await DataService.logout(); UI.toast({ icon: '👋', title: t('profile.bye'), light: true, duration: 2000 }); } catch (err) { UI.busy(btn, false); UI.handleError(err); }
          return;
        }
        case 'toggle-idea': {
          const activate = btn.dataset.active !== '1';
          UI.busy(btn, true);
          try {
            await DataService.setIdeaActive(btn.dataset.id, activate);
            await load(true);
            App.user = await DataService.getCurrentUser();
            UI.toast({ icon: activate ? '▶️' : '⏸️', title: t(activate ? 'profile.activated' : 'profile.pausedToast'), text: t(activate ? 'profile.activatedText' : 'profile.pausedText'), light: true, duration: 2600 });
          } catch (err) { UI.busy(btn, false); UI.handleError(err); }
          return;
        }
        case 'delete-idea': {
          const idea = ideas.find(i => i.id === btn.dataset.id);
          const ok = await UI.confirm({ icon: '🗑️', title: t('profile.deleteTitle'), text: t('profile.deleteText', { title: idea ? idea.title : '' }), confirmLabel: t('profile.delete'), danger: true });
          if (!ok) return;
          UI.busy(btn, true);
          try {
            await DataService.deleteIdea(btn.dataset.id);
            await load(true);
            App.user = await DataService.getCurrentUser();
            UI.toast({ icon: '🗑️', title: t('profile.deleted'), light: true, duration: 2000 });
          } catch (err) { UI.busy(btn, false); UI.handleError(err); }
          return;
        }
      }
    });
    ctx.on('change', Util.debounce(() => { if (ctx.alive) load(true); }, 500));
    await load();
  },
};

const ProfileEditView = {
  async render(el, params, ctx) {
    el.innerHTML = html`<header class="topbar bordered"><button type="button" class="icon-btn back" data-action="back" data-fallback="#/profile" aria-label="${t('common.back')}">${icon('back')}</button>
      <div class="topbar-title sm">${t('profile.edit')}</div></header>
      <div class="scroll"><div class="pad body" style="padding-top:14px">${UI.loading()}</div></div>
      <div class="sticky-foot"><button type="button" class="btn btn-primary btn-block" data-action="save" disabled>${t('profile.save')}</button></div>`;
    const body = $('.body', el);
    const me = await DataService.getCurrentUser();
    if (!ctx.alive) return;
    if (!me) return App.onUnauthorized();
    App.user = me;
    const st = { name: me.name, birthdate: me.birthdate, gender: me.gender, interestedIn: [...me.interestedIn], city: me.city, bio: me.bio || '', interests: [...me.interests], photos: me.photos.map(p => ({ ...p })) };
    const key = p => `${p.colors[0]}|${p.colors[1]}|${p.emoji || ''}|${p.pattern || 0}`;
    const options = [...me.photos, ...PHOTO_PRESETS.filter(p => !me.photos.some(x => key(x) === key(p)))];
    const maxBirth = new Date(); maxBirth.setFullYear(maxBirth.getFullYear() - 18);
    body.innerHTML = html`<form novalidate>
      <div class="form-section"><h4>${t('userProfile.photos')} <span style="text-transform:none;letter-spacing:0;font-weight:600">${t('profile.photosHint')}</span></h4>
        <div class="field" data-field="photos"><div class="photo-grid">${options.map(p => {
          const i = st.photos.findIndex(x => key(x) === key(p));
          return html`<button type="button" class="photo-option ${i >= 0 ? 'is-on' : ''}" data-photo="${key(p)}" aria-pressed="${i >= 0}">${UI.photoTile(p, st.name)}<span class="sel">${i >= 0 ? i + 1 : ''}</span></button>`;
        })}</div></div></div>
      <div class="form-section"><h4>${t('profile.aboutYou')}</h4>
        <div class="field" data-field="name"><label class="label" for="pe-name">${t('onboarding.firstName')}</label><input id="pe-name" class="input" name="name" maxlength="30" value="${st.name}"></div>
        <div class="field" data-field="birthdate"><label class="label" for="pe-birth">${t('onboarding.birthdate')} <span class="count">${t('profile.shownAsAge')}</span></label><input id="pe-birth" class="input" type="date" name="birthdate" max="${Util.isoDate(new Date())}" value="${st.birthdate}"></div>
        <div class="field" data-field="city"><label class="label" for="pe-city">${t('onboarding.city')}</label><input id="pe-city" class="input" name="city" list="pe-cities" maxlength="60" value="${st.city}">
          <datalist id="pe-cities">${CITY_NAMES.map(c => html`<option value="${c}"></option>`)}</datalist></div>
        <div class="field" data-field="bio"><label class="label" for="pe-bio">${t('profile.bio')} <span class="count">${st.bio.length}/300</span></label><textarea id="pe-bio" class="textarea" name="bio" maxlength="300">${st.bio}</textarea></div>
      </div>
      <div class="form-section"><h4>${t('profile.iAm')}</h4>
        <div class="field" data-field="gender"><div class="chips">${GENDERS.map(g => html`<button type="button" class="chip ${st.gender === g.value ? 'is-on' : ''}" data-gender="${g.value}">${g.emoji} ${g.label}</button>`)}</div></div>
        <h4>${t('profile.interestedIn')}</h4>
        <div class="field" data-field="interestedIn"><div class="chips">${INTEREST_CHOICES.map(c => html`<button type="button" class="chip ${interestKey(st.interestedIn) === c.key ? 'is-on' : ''}" data-interest="${c.key}">${c.emoji} ${c.label}</button>`)}</div></div>
      </div>
      <div class="form-section"><h4>${t('profile.interests')} <span class="tag-count" style="text-transform:none;letter-spacing:0">${st.interests.length}/10</span></h4>
        <div class="field" data-field="interests"><div class="chips">${INTEREST_TAGS.map(tag => html`<button type="button" class="chip sm ${st.interests.includes(tag) ? 'is-on' : ''}" data-tag="${tag}">${Label.interest(tag)}</button>`)}</div></div>
      </div></form>`;
    const form = $('form', body);
    const saveBtn = $('[data-action="save"]', el);
    saveBtn.disabled = false;
    form.addEventListener('input', e => {
      const n = e.target.name;
      if (n && n in st) st[n] = e.target.value;
      if (n === 'bio') $('[data-field="bio"] .count', form).textContent = `${st.bio.length}/300`;
    });
    form.addEventListener('click', e => {
      const btn = e.target.closest('[data-photo],[data-gender],[data-interest],[data-tag]');
      if (!btn) return;
      if (btn.dataset.gender) { st.gender = btn.dataset.gender; $$('[data-gender]', form).forEach(b => b.classList.toggle('is-on', b === btn)); }
      if (btn.dataset.interest) { st.interestedIn = INTEREST_CHOICES.find(c => c.key === btn.dataset.interest).value.slice(); $$('[data-interest]', form).forEach(b => b.classList.toggle('is-on', b === btn)); }
      if (btn.dataset.tag) {
        if (!st.interests.includes(btn.dataset.tag) && st.interests.length >= 10) { UI.toast({ icon: '✋', title: t('onboarding.maxInterests'), light: true, duration: 1800 }); return; }
        toggleIn(st.interests, btn.dataset.tag); btn.classList.toggle('is-on');
        $('.tag-count', form).textContent = `${st.interests.length}/10`;
      }
      if (btn.dataset.photo) {
        const k = btn.dataset.photo;
        const i = st.photos.findIndex(p => key(p) === k);
        if (i >= 0) st.photos.splice(i, 1);
        else {
          if (st.photos.length >= 3) { UI.toast({ icon: '✋', title: t('onboarding.maxPhotos'), light: true, duration: 1800 }); return; }
          st.photos.push({ ...options.find(p => key(p) === k) });
        }
        $$('[data-photo]', form).forEach(b => {
          const j = st.photos.findIndex(p => key(p) === b.dataset.photo);
          b.classList.toggle('is-on', j >= 0); b.setAttribute('aria-pressed', j >= 0);
          $('.sel', b).textContent = j >= 0 ? j + 1 : '';
        });
      }
      UI.clearErrors(form);
    });
    saveBtn.addEventListener('click', async () => {
      if (UI.isBusy(saveBtn)) return;
      UI.clearErrors(form);
      UI.busy(saveBtn, true);
      try {
        App.user = await DataService.updateProfile({ ...st });
        UI.toast({ icon: '✅', title: t('profile.saved'), light: true, duration: 2000 });
        App.back('#/profile');
      } catch (err) {
        UI.busy(saveBtn, false);
        UI.handleError(err, form);
      }
    });
  },
};

const IdeaEditView = {
  async render(el, params, ctx) {
    const id = params[0] || null;
    el.innerHTML = html`<header class="topbar bordered"><button type="button" class="icon-btn back" data-action="back" data-fallback="#/profile" aria-label="${t('common.back')}">${icon('back')}</button>
      <div class="topbar-title sm">${t(id ? 'ideaEdit.editTitle' : 'ideaEdit.newTitle')}</div></header>
      <div class="scroll"><div class="pad slot" style="padding-top:14px">${UI.loading()}</div></div>
      <div class="sticky-foot"><button type="button" class="btn btn-primary btn-block" data-action="save" disabled>${t(id ? 'ideaEdit.saveChanges' : 'ideaEdit.publish')}</button></div>`;
    const slot = $('.slot', el);
    const saveBtn = $('[data-action="save"]', el);
    let idea = null;
    if (id) {
      try { idea = await DataService.getIdea(id); }
      catch (err) { if (ctx.alive) slot.innerHTML = UI.errorState(err); return; }
    }
    if (!ctx.alive) return;
    const editor = IdeaForm.mount(slot, { idea, showInspiration: !id, onSubmit: save });
    saveBtn.disabled = false;
    saveBtn.addEventListener('click', () => editor.submit());
    async function save(data, form) {
      if (UI.isBusy(saveBtn)) return;
      UI.clearErrors(form);
      UI.busy(saveBtn, true);
      try {
        if (id) await DataService.updateIdea(id, data); else await DataService.createIdea(data);
        await App.refreshUser();
        UI.toast({ icon: id ? '✅' : '🚀', title: t(id ? 'ideaEdit.saved' : 'ideaEdit.published'), text: id ? '' : t('ideaEdit.publishedText'), light: true, duration: 2400 });
        App.back('#/profile');
      } catch (err) {
        UI.busy(saveBtn, false);
        UI.handleError(err, form);
      }
    }
  },
};

/* ---------- Blockierte Personen ---------- */
const BlockedUsersView = {
  async render(el, params, ctx) {
    el.innerHTML = html`<header class="topbar bordered"><button type="button" class="icon-btn back" data-action="back" data-fallback="#/profile" aria-label="${t('common.back')}">${icon('back')}</button>
      <div class="topbar-title sm">${t('blocked.title')}</div></header>
      <div class="scroll"><div class="pad list">${UI.skeletonList(2)}</div></div>`;
    const list = $('.list', el);
    let users = [];
    function render() {
      list.innerHTML = users.length
        ? html`<div class="info-note">${icon('info', 18)}<span>${t('blocked.info')}</span></div>
          <div class="settings-list">${users.map(u => html`<div class="si">${UI.avatar(u, 36)}<span class="grow">${u.name}</span>
            <button type="button" class="btn btn-secondary btn-xs" data-unblock="${u.id}">${t('blocked.unblock')}</button></div>`)}</div>`
        : UI.empty({ emoji: '🕊️', title: t('blocked.noneTitle'), text: t('blocked.noneText') });
    }
    async function load() {
      try {
        users = await DataService.getBlockedUsers();
        if (ctx.alive) render();
      } catch (err) { if (ctx.alive) list.innerHTML = UI.errorState(err); }
    }
    el.addEventListener('click', async e => {
      if (e.target.closest('[data-action="retry"]')) return load();
      const b = e.target.closest('[data-unblock]');
      if (!b || UI.isBusy(b)) return;
      const u = users.find(x => x.id === b.dataset.unblock);
      const ok = await UI.confirm({ icon: '🕊️', title: t('blocked.unblockTitle', { name: u.name }), text: t('blocked.unblockText'), confirmLabel: t('blocked.unblock') });
      if (!ok) return;
      UI.busy(b, true);
      try {
        await DataService.unblockUser(u.id);
        UI.toast({ icon: '🕊️', title: t('blocked.unblocked', { name: u.name }), light: true, duration: 2200 });
        await load();
      } catch (err) { UI.busy(b, false); UI.handleError(err); }
    });
    await load();
  },
};

/* =============================================================================
   ENTWICKLER-PANEL (nur npm run dev): Test-Logins, Konto wechseln, Supabase-Check
   ============================================================================= */
const DevPanel = {
  isOpen: false,
  enabled: false,
  init() {
    // Nur mit npm run dev – im Produktionsbuild gibt es weder Panel noch Testkonten
    if (!import.meta.env.DEV || !DataService.dev) { $('#dev-toggle').remove(); $('#dev-panel').remove(); return; }
    this.enabled = true;
    $('#dev-toggle').addEventListener('click', () => this.toggle());
    $('#dev-panel').addEventListener('click', e => this.onClick(e));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && this.isOpen && !$('#overlay-root > *')) this.toggle(false); });
  },
  toggle(force) {
    if (!this.enabled) return;
    const open = typeof force === 'boolean' ? force : !this.isOpen;
    if (open === this.isOpen) return;
    this.isOpen = open;
    const panel = $('#dev-panel');
    $('#dev-toggle').setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('dev-open', open);
    if (open) { panel.hidden = false; panel.classList.remove('out'); this.render(); }
    else { panel.classList.add('out'); setTimeout(() => { if (!this.isOpen) panel.hidden = true; }, 240); }
  },
  refresh() { if (this.enabled && this.isOpen) this.render(); },
  render() {
    const panel = $('#dev-panel');
    const me = App.user;
    const accounts = DataService.dev.testAccounts();
    panel.innerHTML = html`<div class="dev-head">${icon('gear', 20)}<h3>${t('dev.title')}</h3>
        <button type="button" class="icon-btn" data-dev="close" aria-label="${t('dev.close')}">${icon('close', 20)}</button></div>
      <div class="dev-body">
        <div class="dev-section"><h4>${t('dev.current')}</h4>
          ${me ? html`<div class="dev-current">${UI.avatar(me, 38)}<div style="min-width:0;flex:1"><div class="n">${me.name || t('dev.inOnboarding')}</div><div class="e">${me.email}</div></div>
            <button type="button" class="btn btn-sm dev-btn" data-dev="logout">${t('dev.logout')}</button></div>` : html`<div class="dev-note" style="margin:0">${t('dev.nobody')}</div>`}</div>
        <div class="dev-section"><h4>${t('dev.testLogins')}</h4>
          ${accounts.map(a => html`<div class="dev-account"><div class="grow"><div class="n">${a.name}</div><code>${a.email}</code><code>${t('dev.password')}: ${a.password}</code></div>
            <button type="button" class="btn btn-sm dev-btn ${me && me.id === a.id ? 'active' : ''}" data-dev="switch" data-id="${a.id}" ${me && me.id === a.id ? raw('disabled') : ''}>${me && me.id === a.id ? t('dev.active') : t('dev.switch')}</button></div>`)}
          <div class="dev-note">${t('dev.testLoginsNote')}</div></div>
        <div class="dev-section"><h4>${t('dev.supabase.title')}</h4>
          <button type="button" class="btn btn-sm dev-btn btn-block" data-dev="check-supabase">🔌 ${t('dev.supabase.check')}</button>
          <div class="dev-note">${t('dev.supabase.note')}</div></div>
      </div>`;
  },
  async switchTo(userId, btn) {
    UI.busy(btn, true);
    try {
      const u = await DataService.dev.switchUser(userId);
      UI.toast({ icon: '🔄', title: t('dev.switched', { name: u.name || u.email }), light: true, duration: 2200 });
      if (window.matchMedia('(max-width: 520px)').matches) this.toggle(false);
    } catch (err) { UI.handleError(err); }
    UI.busy(btn, false);
  },
  async checkSupabase(btn) {
    UI.busy(btn, true);
    const r = await DataService.dev.checkSupabase();
    UI.busy(btn, false);
    if (!r.configured) return UI.toast({ icon: '⚙️', title: t('dev.supabase.notConfigured'), text: t('dev.supabase.notConfiguredText'), light: true, duration: 3200 });
    if (r.ok) return UI.toast({ icon: '✅', title: t('dev.supabase.ok'), text: t('dev.supabase.okText', { ms: r.ms, version: r.version || '–' }), light: true, duration: 3200 });
    UI.toast({ icon: '❌', title: t('dev.supabase.failed'), text: t('dev.supabase.failedText', { status: r.status || t('dev.supabase.noResponse') }), light: true, duration: 4200 });
  },
  async onClick(e) {
    const btn = e.target.closest('[data-dev]');
    if (!btn || btn.disabled || UI.isBusy(btn)) return;
    switch (btn.dataset.dev) {
      case 'close': return this.toggle(false);
      case 'switch': return this.switchTo(btn.dataset.id, btn);
      case 'check-supabase': return this.checkSupabase(btn);
      case 'logout':
        UI.busy(btn, true);
        try { await DataService.logout(); } catch (err) { UI.handleError(err); }
        return;
    }
  },
};

export { ProfileView, ProfileEditView, IdeaEditView, BlockedUsersView, DevPanel };
