import { Util, raw, html, icon, GENDERS, GENDER, INTEREST_CHOICES, interestKey, CITY_NAMES, INTEREST_TAGS } from './core.js';
import { DataService } from './dataService.js';
import { $, $$, shortCity, toggleIn, UI, App } from './uiCore.js';
import { IdeaForm } from './viewsAuth.js';
import { t } from '../i18n/index.js';

/* =============================================================================
   ANSICHTEN: Eigenes Profil, Profil bearbeiten, Idee anlegen/bearbeiten
   ============================================================================= */
const ProfileView = {
  async render(el, params, ctx) {
    el.innerHTML = html`<header class="topbar"><h1>Profil</h1>
      <div class="actions"><button type="button" class="icon-btn" data-action="preview" aria-label="Profil-Vorschau">${icon('eye')}</button>
      <button type="button" class="icon-btn" data-go="#/profile/edit" aria-label="Profil bearbeiten">${icon('edit')}</button></div></header>
      <div class="scroll"><div class="pad body">${UI.loading()}</div></div>`;
    const body = $('.body', el);
    let me = null, ideas = [], sig = '';

    function ideaRow(i) {
      return html`<div class="idea-row ${i.active ? '' : 'paused'}" data-idea="${i.id}">
        <div class="ir-top">${UI.ideaThumb(i)}<div style="flex:1;min-width:0"><div class="ir-title">${i.title}</div>
          <div class="ir-sub">${i.active ? html`<span class="pill green">Aktiv</span>` : html`<span class="pill gray">Pausiert</span>`}
            <span>${i.category} · ${i.budget}</span>
            ${i.pendingLikes ? html`<span class="pill primary">${i.pendingLikes} Anfrage${i.pendingLikes > 1 ? 'n' : ''}</span>` : ''}
            ${i.matchCount ? html`<span class="pill plum">${i.matchCount} Match${i.matchCount > 1 ? 'es' : ''}</span>` : ''}</div></div></div>
        <div class="ir-actions">
          <button type="button" class="btn btn-secondary btn-xs" data-go="#/ideas/${i.id}/edit">${icon('edit', 15)} Bearbeiten</button>
          <button type="button" class="btn btn-secondary btn-xs" data-action="toggle-idea" data-id="${i.id}" data-active="${i.active ? 1 : 0}">${i.active ? html`${icon('pause', 15)} Pausieren` : html`${icon('play', 15)} Aktivieren`}</button>
          <button type="button" class="btn btn-danger btn-xs" style="flex:0 0 auto" data-action="delete-idea" data-id="${i.id}" aria-label="Idee löschen">${icon('trash', 15)}</button>
        </div></div>`;
    }
    function render() {
      const activeCount = ideas.filter(i => i.active).length;
      body.innerHTML = html`
        <div class="profile-hero">${UI.photoTile(me.photos[0], me.name)}
          <div class="ph-overlay"><div class="ph-name">${me.name}, ${me.age}</div><div class="ph-sub">${icon('pin', 15)} ${me.city}</div></div></div>
        <div class="row-actions"><button type="button" class="btn btn-secondary btn-sm" data-go="#/profile/edit">${icon('edit', 16)} Profil bearbeiten</button>
          <button type="button" class="btn btn-secondary btn-sm" data-action="preview">${icon('eye', 16)} Vorschau</button></div>
        <p class="bio ${me.bio ? '' : 'empty-bio'}">${me.bio || 'Noch keine Bio – erzähl anderen, wer hinter deinen Ideen steckt.'}</p>
        <div class="chips">${me.interests.map(t => html`<span class="tag">${t}</span>`)}</div>
        <div class="section-title">Meine Date-Ideen (${ideas.length})<button type="button" class="btn btn-soft btn-xs" data-go="#/ideas/new">${icon('plus', 15)} Neue Idee</button></div>
        ${ideas.length && !activeCount ? html`<div class="banner"><div class="bt">${icon('info', 18)} Alle Ideen sind pausiert</div><span style="font-size:13.5px;color:var(--ink-2)">Niemand sieht dich gerade im Feed – und dein eigener Feed bleibt gesperrt, bis eine Idee aktiv ist.</span></div>` : ''}
        ${ideas.length ? ideas.map(ideaRow) : UI.empty({ emoji: '💡', title: 'Noch keine Idee', text: 'Ohne eigene Idee bleibt dein Feed gesperrt.', actions: [{ label: 'Idee anlegen', go: '#/ideas/new', icon: 'plus' }] })}
        <div class="section-title">Konto</div>
        <div class="settings-list">
          <div class="si">${icon('mail', 20)}<span class="grow">E-Mail</span><span class="val">${me.email}</span></div>
          <button type="button" class="si" data-action="dev">${icon('gear', 20)}<span class="grow">Entwickler-Panel</span>${icon('chevronRight', 18)}</button>
          <button type="button" class="si danger" data-action="logout">${icon('logout', 20)}<span class="grow">Abmelden</span></button>
        </div>
        <p class="foot-note">asap · Entwicklungsversion<br>Alle Daten liegen lokal in deinem Browser (${DataService.storageMode}).</p>`;
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
      const t = e.target.closest('[data-action]');
      if (!t || UI.isBusy(t)) return;
      switch (t.dataset.action) {
        case 'retry': return load();
        case 'preview': return App.go('#/user/' + App.user.id);
        case 'dev': return DevPanel.toggle(true);
        case 'logout': {
          const ok = await UI.confirm({ icon: '👋', title: 'Abmelden?', text: 'Deine Ideen, Matches und Chats bleiben gespeichert.', confirmLabel: 'Abmelden' });
          if (!ok) return;
          UI.busy(t, true);
          try { await DataService.logout(); UI.toast({ icon: '👋', title: 'Bis bald!', light: true, duration: 2000 }); } catch (err) { UI.busy(t, false); UI.handleError(err); }
          return;
        }
        case 'toggle-idea': {
          const activate = t.dataset.active !== '1';
          UI.busy(t, true);
          try {
            await DataService.setIdeaActive(t.dataset.id, activate);
            await load(true);
            App.user = await DataService.getCurrentUser();
            UI.toast({ icon: activate ? '▶️' : '⏸️', title: activate ? 'Idee ist wieder aktiv' : 'Idee pausiert', text: activate ? 'Sie erscheint wieder im Feed.' : 'Sie erscheint nicht mehr im Feed. Offene Anfragen bleiben erhalten.', light: true, duration: 2600 });
          } catch (err) { UI.busy(t, false); UI.handleError(err); }
          return;
        }
        case 'delete-idea': {
          const idea = ideas.find(i => i.id === t.dataset.id);
          const ok = await UI.confirm({ icon: '🗑️', title: 'Idee löschen?', text: `„${idea ? idea.title : ''}“ wird entfernt. Offene Anfragen verfallen, bestehende Matches und Chats bleiben erhalten.`, confirmLabel: 'Löschen', danger: true });
          if (!ok) return;
          UI.busy(t, true);
          try {
            await DataService.deleteIdea(t.dataset.id);
            await load(true);
            App.user = await DataService.getCurrentUser();
            UI.toast({ icon: '🗑️', title: 'Idee gelöscht', light: true, duration: 2000 });
          } catch (err) { UI.busy(t, false); UI.handleError(err); }
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
    el.innerHTML = html`<header class="topbar bordered"><button type="button" class="icon-btn back" data-action="back" data-fallback="#/profile" aria-label="Zurück">${icon('back')}</button>
      <div class="topbar-title sm">Profil bearbeiten</div></header>
      <div class="scroll"><div class="pad body" style="padding-top:14px">${UI.loading()}</div></div>
      <div class="sticky-foot"><button type="button" class="btn btn-primary btn-block" data-action="save" disabled>Speichern</button></div>`;
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
      <div class="form-section"><h4>Profilbilder <span style="text-transform:none;letter-spacing:0;font-weight:600">(1–3, das erste ist dein Hauptbild)</span></h4>
        <div class="field" data-field="photos"><div class="photo-grid">${options.map(p => {
          const i = st.photos.findIndex(x => key(x) === key(p));
          return html`<button type="button" class="photo-option ${i >= 0 ? 'is-on' : ''}" data-photo="${key(p)}" aria-pressed="${i >= 0}">${UI.photoTile(p, st.name)}<span class="sel">${i >= 0 ? i + 1 : ''}</span></button>`;
        })}</div></div></div>
      <div class="form-section"><h4>Über dich</h4>
        <div class="field" data-field="name"><label class="label" for="pe-name">Vorname</label><input id="pe-name" class="input" name="name" maxlength="30" value="${st.name}"></div>
        <div class="field" data-field="birthdate"><label class="label" for="pe-birth">Geburtsdatum <span class="count">wird als Alter angezeigt</span></label><input id="pe-birth" class="input" type="date" name="birthdate" max="${Util.isoDate(new Date())}" value="${st.birthdate}"></div>
        <div class="field" data-field="city"><label class="label" for="pe-city">Stadt / Stadtteil</label><input id="pe-city" class="input" name="city" list="pe-cities" maxlength="60" value="${st.city}">
          <datalist id="pe-cities">${CITY_NAMES.map(c => html`<option value="${c}"></option>`)}</datalist></div>
        <div class="field" data-field="bio"><label class="label" for="pe-bio">Bio <span class="count">${st.bio.length}/300</span></label><textarea id="pe-bio" class="textarea" name="bio" maxlength="300">${st.bio}</textarea></div>
      </div>
      <div class="form-section"><h4>Ich bin</h4>
        <div class="field" data-field="gender"><div class="chips">${GENDERS.map(g => html`<button type="button" class="chip ${st.gender === g.value ? 'is-on' : ''}" data-gender="${g.value}">${g.emoji} ${g.label}</button>`)}</div></div>
        <h4>Ich interessiere mich für</h4>
        <div class="field" data-field="interestedIn"><div class="chips">${INTEREST_CHOICES.map(c => html`<button type="button" class="chip ${interestKey(st.interestedIn) === c.key ? 'is-on' : ''}" data-interest="${c.key}">${c.emoji} ${c.label}</button>`)}</div></div>
      </div>
      <div class="form-section"><h4>Interessen <span class="tag-count" style="text-transform:none;letter-spacing:0">${st.interests.length}/10</span></h4>
        <div class="field" data-field="interests"><div class="chips">${INTEREST_TAGS.map(t => html`<button type="button" class="chip sm ${st.interests.includes(t) ? 'is-on' : ''}" data-tag="${t}">${t}</button>`)}</div></div>
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
      const t = e.target.closest('[data-photo],[data-gender],[data-interest],[data-tag]');
      if (!t) return;
      if (t.dataset.gender) { st.gender = t.dataset.gender; $$('[data-gender]', form).forEach(b => b.classList.toggle('is-on', b === t)); }
      if (t.dataset.interest) { st.interestedIn = INTEREST_CHOICES.find(c => c.key === t.dataset.interest).value.slice(); $$('[data-interest]', form).forEach(b => b.classList.toggle('is-on', b === t)); }
      if (t.dataset.tag) {
        if (!st.interests.includes(t.dataset.tag) && st.interests.length >= 10) { UI.toast({ icon: '✋', title: 'Maximal 10 Interessen', light: true, duration: 1800 }); return; }
        toggleIn(st.interests, t.dataset.tag); t.classList.toggle('is-on');
        $('.tag-count', form).textContent = `${st.interests.length}/10`;
      }
      if (t.dataset.photo) {
        const k = t.dataset.photo;
        const i = st.photos.findIndex(p => key(p) === k);
        if (i >= 0) st.photos.splice(i, 1);
        else {
          if (st.photos.length >= 3) { UI.toast({ icon: '✋', title: 'Maximal 3 Bilder', light: true, duration: 1800 }); return; }
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
        UI.toast({ icon: '✅', title: 'Profil gespeichert', light: true, duration: 2000 });
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
    el.innerHTML = html`<header class="topbar bordered"><button type="button" class="icon-btn back" data-action="back" data-fallback="#/profile" aria-label="Zurück">${icon('back')}</button>
      <div class="topbar-title sm">${id ? 'Idee bearbeiten' : 'Neue Date-Idee'}</div></header>
      <div class="scroll"><div class="pad slot" style="padding-top:14px">${UI.loading()}</div></div>
      <div class="sticky-foot"><button type="button" class="btn btn-primary btn-block" data-action="save" disabled>${id ? 'Änderungen speichern' : 'Idee veröffentlichen'}</button></div>`;
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
        UI.toast({ icon: id ? '✅' : '🚀', title: id ? 'Idee gespeichert' : 'Idee veröffentlicht!', text: id ? '' : 'Sie erscheint jetzt im Feed anderer.', light: true, duration: 2400 });
        App.back('#/profile');
      } catch (err) {
        UI.busy(saveBtn, false);
        UI.handleError(err, form);
      }
    }
  },
};

/* =============================================================================
   ENTWICKLER-PANEL (Test-Logins, Account-Wechsel, Simulation, Reset)
   ============================================================================= */
const DevPanel = {
  isOpen: false,
  confirmReset: false,
  selectedUser: '',
  init() {
    $('#dev-toggle').addEventListener('click', () => this.toggle());
    const panel = $('#dev-panel');
    panel.addEventListener('click', e => this.onClick(e));
    panel.addEventListener('change', e => {
      if (e.target.matches('[data-dev="auto"]')) {
        const s = DataService.dev.setAutoReplies(e.target.checked);
        UI.toast({ icon: s.autoReplies ? '🤖' : '⏸️', title: s.autoReplies ? 'Auto-Antworten an' : 'Auto-Antworten aus', text: s.autoReplies ? 'Testaccounts reagieren wieder automatisch.' : 'Geplante Reaktionen sind pausiert.', light: true, duration: 2200 });
      }
      if (e.target.matches('[data-dev-select]')) this.selectedUser = e.target.value;
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && this.isOpen && !$('#overlay-root > *')) this.toggle(false); });
    DataService.on('settings', () => this.refresh());
  },
  toggle(force) {
    const open = typeof force === 'boolean' ? force : !this.isOpen;
    if (open === this.isOpen) return;
    this.isOpen = open;
    const panel = $('#dev-panel');
    $('#dev-toggle').setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('dev-open', open);
    if (open) { panel.hidden = false; panel.classList.remove('out'); this.confirmReset = false; this.render(); }
    else { panel.classList.add('out'); setTimeout(() => { if (!this.isOpen) panel.hidden = true; }, 240); }
  },
  refresh() { if (this.isOpen) this.render(); },
  refreshSoon: Util.debounce(() => DevPanel.updateStats(), 400),
  updateStats() {
    if (!this.isOpen) return;
    const st = DataService.dev.stats();
    const box = $('#dev-panel .dev-stats');
    if (box) box.innerHTML = this.statsHtml(st);
    const ff = $('#dev-panel [data-dev="ffwd"]');
    if (ff) ff.textContent = `⏩ Sofort ausführen (${st.queue})`;
  },
  statsHtml(st) {
    return html`<div class="dev-stat"><span>Nutzer:innen</span><b>${st.users}</b></div><div class="dev-stat"><span>Aktive Ideen gesamt</span><b>${st.ideas}</b></div>
      <div class="dev-stat"><span>Likes</span><b>${st.likes}</b></div><div class="dev-stat"><span>Matches</span><b>${st.matches}</b></div>
      <div class="dev-stat"><span>Nachrichten</span><b>${st.messages}</b></div><div class="dev-stat"><span>Geplante Bot-Reaktionen</span><b>${st.queue}</b></div>
      <div class="dev-stat"><span>Speicher</span><b>${DataService.storageMode}</b></div>`;
  },
  render() {
    const panel = $('#dev-panel');
    const me = App.user;
    const accounts = DataService.dev.testAccounts();
    const s = DataService.dev.getSettings();
    const st = DataService.dev.stats();
    panel.innerHTML = html`<div class="dev-head">${icon('gear', 20)}<h3>Entwickler-Panel</h3>
        <button type="button" class="icon-btn" data-dev="close" aria-label="Schließen">${icon('close', 20)}</button></div>
      <div class="dev-body">
        <div class="dev-section"><h4>Aktuell eingeloggt</h4>
          ${me ? html`<div class="dev-current">${UI.avatar(me, 38)}<div style="min-width:0;flex:1"><div class="n">${me.name || '(im Onboarding)'}${me.isBot ? html`<span class="dev-badge">simuliert</span>` : ''}</div><div class="e">${me.email}</div></div>
            <button type="button" class="btn btn-sm dev-btn" data-dev="logout">Abmelden</button></div>` : html`<div class="dev-note" style="margin:0">Niemand eingeloggt.</div>`}</div>
        <div class="dev-section"><h4>Test-Logins</h4>
          ${accounts.map(a => html`<div class="dev-account"><div class="grow"><div class="n">${a.name}</div><code>${a.email}</code><code>Passwort: ${a.password}</code></div>
            <button type="button" class="btn btn-sm dev-btn ${me && me.id === a.id ? 'active' : ''}" data-dev="switch" data-id="${a.id}" ${me && me.id === a.id ? raw('disabled') : ''}>${me && me.id === a.id ? 'Aktiv' : 'Wechseln'}</button></div>`)}
          <div class="dev-note">Wechsel ohne Passwort, um beide Seiten eines Likes oder Matches zu testen. Tipp: Ohne „Eingeloggt bleiben“ angemeldet, kannst du in zwei Browser-Tabs gleichzeitig zwei Accounts nutzen.</div></div>
        <div class="dev-section"><h4>Als beliebige Person einloggen</h4>
          <div class="dev-row"><select class="select" data-dev-select aria-label="Person auswählen"><option value="">Lade …</option></select>
            <button type="button" class="btn btn-sm dev-btn" data-dev="switch-select">Wechseln</button></div>
          <div class="dev-note">Z. B. als Lena einloggen und eine Anfrage von Jonas annehmen – oder schauen, wie dein Like auf der anderen Seite ankommt.</div></div>
        <div class="dev-section"><h4>Simulation</h4>
          <div class="dev-row" style="justify-content:space-between;align-items:flex-start;gap:14px"><div><div style="font-weight:700;font-size:14px">Auto-Antworten der Testaccounts</div>
            <div class="dev-note" style="margin:3px 0 0">Nehmen Likes zu ~50 % nach 3–10 s an, antworten im Chat und bestätigen Termine.</div></div>
            <label class="switch"><input type="checkbox" data-dev="auto" ${s.autoReplies ? raw('checked') : ''} aria-label="Auto-Antworten"><span class="track"></span></label></div>
          <div class="dev-row" style="margin-top:12px;flex-wrap:wrap">
            <button type="button" class="btn btn-sm dev-btn" data-dev="sim-like" ${me ? '' : raw('disabled')}>❤️ Anfrage simulieren</button>
            <button type="button" class="btn btn-sm dev-btn" data-dev="ffwd">⏩ Sofort ausführen (${st.queue})</button></div></div>
        <div class="dev-section"><h4>${t('dev.supabase.title')}</h4>
          <button type="button" class="btn btn-sm dev-btn btn-block" data-dev="check-supabase">🔌 ${t('dev.supabase.check')}</button>
          <div class="dev-note">${t('dev.supabase.note')}</div></div>
        <div class="dev-section"><h4>Daten</h4><div class="dev-stats">${this.statsHtml(st)}</div>
          ${this.confirmReset ? html`<div class="dev-note" style="color:#FFB4B4">Wirklich alles zurücksetzen? Registrierte Konten, Likes und Chats gehen verloren.</div>
            <div class="dev-row" style="margin-top:8px"><button type="button" class="btn btn-sm btn-danger" style="flex:1" data-dev="reset-yes">Ja, zurücksetzen</button><button type="button" class="btn btn-sm dev-btn" data-dev="reset-no">Abbrechen</button></div>`
            : html`<button type="button" class="btn btn-sm btn-danger btn-block" style="margin-top:12px" data-dev="reset">${icon('refresh', 16)} Alle Daten zurücksetzen</button>`}
        </div>
      </div>`;
    this.fillUsers();
  },
  async fillUsers() {
    const select = $('#dev-panel [data-dev-select]');
    if (!select) return;
    try {
      const users = await DataService.dev.listUsers();
      if (!select.isConnected) return;
      const group = (label, list) => list.length ? html`<optgroup label="${label}">${list.map(u => html`<option value="${u.id}">${u.name}${u.age ? ', ' + u.age : ''} · ${GENDER[u.gender] ? GENDER[u.gender].label : '–'} · ${shortCity(u.city) || 'ohne Stadt'}</option>`)}</optgroup>` : '';
      select.innerHTML = html`<option value="">Person wählen …</option>
        ${group('Login-Testaccounts', users.filter(u => u.isTestAccount))}
        ${group('Simulierte Personen', users.filter(u => u.isBot))}
        ${group('Registrierte Konten', users.filter(u => !u.isBot && !u.isTestAccount))}`;
      if (this.selectedUser) select.value = this.selectedUser;
    } catch (e) { select.innerHTML = '<option value="">Fehler beim Laden</option>'; }
  },
  async switchTo(userId, btn) {
    if (!userId) { UI.toast({ icon: '👆', title: 'Bitte zuerst eine Person wählen', light: true, duration: 1800 }); return; }
    UI.busy(btn, true);
    try {
      const u = await DataService.dev.switchUser(userId);
      UI.toast({ icon: '🔄', title: `Eingeloggt als ${u.name || u.email}`, light: true, duration: 2200 });
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
    const t = e.target.closest('[data-dev]');
    if (!t || t.disabled || UI.isBusy(t)) return;
    switch (t.dataset.dev) {
      case 'close': return this.toggle(false);
      case 'switch': return this.switchTo(t.dataset.id, t);
      case 'switch-select': return this.switchTo($('#dev-panel [data-dev-select]').value, t);
      case 'logout':
        UI.busy(t, true);
        try { await DataService.logout(); } catch (err) { UI.handleError(err); }
        return;
      case 'sim-like':
        UI.busy(t, true);
        try { await DataService.dev.simulateIncomingLike(); } catch (err) { UI.handleError(err); }
        UI.busy(t, false);
        return;
      case 'ffwd': {
        const n = DataService.dev.fastForward();
        UI.toast({ icon: '⏩', title: n ? `${n} geplante Reaktion${n === 1 ? '' : 'en'} ausgeführt` : 'Keine geplanten Reaktionen', text: DataService.dev.getSettings().autoReplies ? '' : 'Hinweis: Auto-Antworten sind ausgeschaltet.', light: true, duration: 2200 });
        this.updateStats();
        return;
      }
      case 'check-supabase': return this.checkSupabase(t);
      case 'reset': this.confirmReset = true; return this.render();
      case 'reset-no': this.confirmReset = false; return this.render();
      case 'reset-yes':
        UI.busy(t, true);
        try {
          await DataService.dev.resetAll();
          this.confirmReset = false;
          UI.toast({ icon: '♻️', title: 'Alle Daten zurückgesetzt', text: 'Test-Logins: test1@datedate.app / test2@datedate.app', light: true, duration: 3200 });
          this.render();
        } catch (err) { UI.busy(t, false); UI.handleError(err); }
        return;
    }
  },
};

export { ProfileView, ProfileEditView, IdeaEditView, DevPanel };
