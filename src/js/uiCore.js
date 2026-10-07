import { Util, escapeHtml, raw, html, Fmt, icon, logoMark, logo, CATEGORIES, CAT, BUDGETS, TIME, ApiError } from './core.js';
import { DataService } from './dataService.js';
import { LoginView, RegisterView, OnboardingView } from './viewsAuth.js';
import { FeedView, RequestsView, UserProfileView } from './viewsFeed.js';
import { ChatsView, ChatView, DatesView } from './viewsChat.js';
import { ProfileView, ProfileEditView, IdeaEditView, DevPanel } from './viewsProfile.js';

import { t } from '../i18n/index.js';
/* =============================================================================
   5) UI – Komponenten, Overlays, Router
   Die UI spricht ausschließlich mit dem DataService (nie mit localStorage).
   ============================================================================= */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const FALLBACK_GRADIENTS = [['#FF9A8B', '#FF5E7E'], ['#FAD961', '#F76B1C'], ['#43E97B', '#1FA2A0'], ['#4FACFE', '#2563EB'], ['#A18CD1', '#E58FD0'], ['#5B2A4E', '#C2577E']];
function shortCity(city) { return String(city || '').replace(/^Frankfurt-/, ''); }
function catStyle(category) { const c = CAT[category] || CATEGORIES[0]; return `--a:${c.from};--b:${c.to}`; }
/**
 * Formular-Absenden ohne natives submit-Event: funktioniert auch in Sandbox-Iframes
 * ohne „allow-forms“ (z. B. Vorschaufenster). Enter in Eingabefeldern löst ebenfalls aus.
 */
function bindSubmit(form, handler) {
  form.addEventListener('submit', e => { e.preventDefault(); handler(); });
  form.addEventListener('click', e => { if (e.target.closest('[data-submit]')) { e.preventDefault(); handler(); } });
  form.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.isComposing) return;
    if (e.target.matches('input:not([type="checkbox"]):not([type="radio"]):not([list])')) { e.preventDefault(); handler(); }
  });
}
function toggleIn(arr, v) { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); return arr; }

const UI = {
  avatar(user, size = 44, cls = '') {
    const ph = user && user.photos && user.photos[0];
    const colors = ph ? ph.colors : FALLBACK_GRADIENTS[Util.hash(String((user && (user.id || user.name)) || 'x')) % FALLBACK_GRADIENTS.length];
    return html`<span class="ava ${cls}" style="--s:${size}px;--a:${colors[0]};--b:${colors[1]}" aria-hidden="true">${Util.initials(user && user.name)}</span>`;
  },
  photoTile(ph, name, cls = '') {
    const colors = ph ? ph.colors : ['#FFB547', '#FF5A3C'];
    const hasEmoji = ph && ph.emoji;
    return html`<div class="photo pat-${(ph && ph.pattern) || 0} ${hasEmoji ? '' : 'init-only'} ${cls}" style="--a:${colors[0]};--b:${colors[1]}">${hasEmoji ? html`<span class="ph-emoji">${ph.emoji}</span>` : ''}<span class="ph-init">${Util.initials(name)}</span></div>`;
  },
  ideaThumb(idea, size = '') {
    const cat = CAT[idea && idea.category] || CATEGORIES[0];
    return html`<span class="idea-thumb ${size}" style="${catStyle(idea && idea.category)}" aria-hidden="true">${(idea && idea.emoji) || cat.emoji}</span>`;
  },
  metaChips(idea) {
    const b = BUDGETS.find(x => x.value === idea.budget);
    const t = TIME[idea.timeOfDay];
    return html`<div class="icard-meta">
      <span class="meta-chip budget" title="${b ? b.hint : ''}">${idea.budget}</span>
      <span class="meta-chip">${icon('clock', 14)} ${idea.duration}</span>
      <span class="meta-chip">${t ? t.emoji : ''} ${idea.timeOfDay}</span>
    </div>`;
  },
  /** Die Date-Idee ist das Hauptelement – die Person steht darunter. */
  ideaCard(item, { variant = 'swipe', posClass = '', footer = null, showOwner = true } = {}) {
    const { idea, owner, distanceKm } = item;
    const cat = CAT[idea.category] || CATEGORIES[0];
    const cls = variant === 'swipe' ? `icard ${posClass}` : variant === 'compact' ? 'icard compact' : 'icard preview';
    const shared = owner && owner.sharedInterests ? owner.sharedInterests.length : 0;
    return html`<article class="${cls}" data-idea="${idea.id || ''}" style="${catStyle(idea.category)}" aria-label="Date-Idee: ${idea.title}">
      <div class="icard-hero">
        <div class="icard-top">
          <span class="glass">${cat.emoji} ${cat.label}</span>
          ${distanceKm != null ? html`<span class="glass">${icon('nav', 13)} ${Fmt.km(distanceKm)}</span>` : ''}
        </div>
        <div class="icard-emoji" aria-hidden="true">${idea.emoji || cat.emoji}</div>
        ${variant === 'swipe' ? html`<div class="stamp stamp-like" aria-hidden="true">DABEI!</div><div class="stamp stamp-pass" aria-hidden="true">NÄCHSTE</div>` : ''}
        <div class="icard-kicker">Date-Idee</div>
        <h2 class="icard-title">${idea.title || 'Dein Titel'}</h2>
      </div>
      <div class="icard-body">
        <p class="icard-desc">${idea.description || 'Hier steht deine Beschreibung.'}</p>
        ${UI.metaChips(idea)}
        <div class="icard-loc">${icon('pin', 16)}<span>${idea.location || 'Treffpunkt'}</span></div>
        ${footer || ''}
      </div>
      ${owner && showOwner ? html`<button class="icard-person" type="button" data-go="#/user/${owner.id}" aria-label="Profil von ${owner.name} ansehen">
        ${UI.avatar(owner, 40)}
        <span class="pi"><span class="pn">${owner.name}${owner.age ? ', ' + owner.age : ''}</span>
          <span class="ps">${shortCity(owner.city)}${shared ? ` · ${shared} gemeinsame${shared === 1 ? 's' : ''} Interesse${shared === 1 ? '' : 'n'}` : ''}</span></span>
        <span class="more">${icon('chevronRight', 18)}</span>
      </button>` : ''}
    </article>`;
  },
  empty({ emoji, title, text, actions = [] }) {
    return html`<div class="empty"><div class="em" aria-hidden="true">${emoji}</div><h3>${title}</h3>${text ? html`<p>${text}</p>` : ''}
      ${actions.length ? html`<div class="actions">${actions.map(a => html`<button type="button" class="btn ${a.kind || 'btn-primary'}" ${a.go ? raw(`data-go="${escapeHtml(a.go)}"`) : raw(`data-action="${escapeHtml(a.action)}"`)}>${a.icon ? icon(a.icon, 18) : ''}${a.label}</button>`)}</div>` : ''}</div>`;
  },
  errorState(err) {
    return UI.empty({ emoji: '⚠️', title: 'Das hat nicht geklappt', text: (err && err.message) || 'Unbekannter Fehler.', actions: [{ label: 'Erneut versuchen', action: 'retry', icon: 'refresh' }] });
  },
  skeletonList(n = 3) {
    return html`${Array.from({ length: n }, () => html`<div class="sk-row"><div class="skeleton sk-circle"></div><div class="sk-lines"><div class="skeleton sk-line" style="width:55%"></div><div class="skeleton sk-line" style="width:85%"></div></div></div>`)}`;
  },
  loading() { return html`<div class="loading-center"><div class="spinner" role="status" aria-label="Lädt"></div></div>`; },

  /* ---------- Toasts ---------- */
  toast({ icon: ic = '✨', title, text = '', onClick = null, duration = 3800, light = false }) {
    const root = $('#toast-root');
    const el = document.createElement('div');
    el.className = 'toast' + (onClick ? ' clickable' : '') + (light ? ' light' : '');
    if (!onClick) el.style.pointerEvents = 'none'; // reine Info-Toasts blockieren keine Klicks darunter
    el.innerHTML = html`<span class="t-ico">${ic}</span><span class="t-body"><span class="t-title" style="display:block">${title}</span>${text ? html`<span class="t-text" style="display:block">${text}</span>` : ''}</span>`;
    const remove = () => { if (el.classList.contains('out')) return; el.classList.add('out'); setTimeout(() => el.remove(), 300); };
    el.addEventListener('click', () => { remove(); if (onClick) onClick(); });
    root.appendChild(el);
    while (root.children.length > 3) root.firstElementChild.remove();
    setTimeout(remove, duration);
  },

  /* ---------- Bottom Sheet ---------- */
  sheet({ title, subtitle = '', body, foot = '', onMount = null, onClose = null }) {
    const root = $('#overlay-root');
    const layer = document.createElement('div');
    layer.className = 'sheet-layer';
    layer.innerHTML = html`<div class="sheet-backdrop" data-close></div>
      <div class="sheet" role="dialog" aria-modal="true" aria-label="${title}">
        <div class="sheet-handle"></div>
        <div class="sheet-head"><div style="flex:1;min-width:0"><h3>${title}</h3>${subtitle ? html`<p>${subtitle}</p>` : ''}</div>
          <button type="button" class="icon-btn" data-close aria-label="Schließen">${icon('close', 20)}</button></div>
        <div class="sheet-body">${body}</div>
        ${foot ? html`<div class="sheet-foot">${foot}</div>` : ''}
      </div>`;
    let closed = false;
    const onKey = e => { if (e.key === 'Escape') close(); };
    function close(result) {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey);
      layer.querySelector('.sheet').classList.add('out');
      layer.querySelector('.sheet-backdrop').classList.add('out');
      setTimeout(() => layer.remove(), 280);
      if (onClose) onClose(result);
    }
    layer.addEventListener('click', e => { if (e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', onKey);
    root.appendChild(layer);
    if (onMount) onMount(layer.querySelector('.sheet'), close);
    return { el: layer, close };
  },
  closeOverlays() { $$('#overlay-root > .sheet-layer').forEach(el => el.remove()); },

  /* ---------- Bestätigungsdialog (statt window.confirm) ---------- */
  confirm({ icon: ic = '❓', title, text = '', confirmLabel = 'OK', cancelLabel = 'Abbrechen', danger = false }) {
    return new Promise(resolve => {
      const layer = document.createElement('div');
      layer.className = 'sheet-layer';
      layer.innerHTML = html`<div class="sheet-backdrop"></div><div class="dialog-wrap" data-res="0"><div class="dialog" role="alertdialog" aria-modal="true" aria-label="${title}">
        <div class="d-ico">${ic}</div><h3>${title}</h3>${text ? html`<p>${text}</p>` : ''}
        <div class="d-actions"><button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-block" data-res="1">${confirmLabel}</button>
        <button type="button" class="btn btn-ghost btn-block" data-res="0">${cancelLabel}</button></div></div></div>`;
      const onKey = e => { if (e.key === 'Escape') done(false); };
      function done(v) {
        document.removeEventListener('keydown', onKey);
        layer.querySelector('.dialog').classList.add('out');
        layer.querySelector('.sheet-backdrop').classList.add('out');
        setTimeout(() => layer.remove(), 200);
        resolve(v);
      }
      layer.addEventListener('click', e => {
        const t = e.target.closest('[data-res]');
        if (!t) return;
        if (t.classList.contains('dialog-wrap') && e.target !== t) return;
        done(t.dataset.res === '1');
      });
      document.addEventListener('keydown', onKey);
      $('#overlay-root').appendChild(layer);
      setTimeout(() => { const b = layer.querySelector('[data-res="1"]'); if (b) b.focus(); }, 50);
    });
  },

  /* ---------- Formular-Helfer ---------- */
  busy(btn, on) {
    if (!btn) return;
    btn.classList.toggle('is-loading', !!on);
    if (on) btn.setAttribute('aria-busy', 'true'); else btn.removeAttribute('aria-busy');
  },
  isBusy(btn) { return !!(btn && btn.getAttribute('aria-busy') === 'true'); },
  clearErrors(root) {
    if (!root) return;
    $$('.field-error', root).forEach(e => e.remove());
    $$('.has-error', root).forEach(e => e.classList.remove('has-error'));
    $$('.form-alert', root).forEach(e => e.remove());
  },
  fieldErrors(root, fields) {
    UI.clearErrors(root);
    let first = null;
    const unmatched = [];
    Object.entries(fields || {}).forEach(([name, msg]) => {
      const field = root.querySelector(`[data-field="${name}"]`);
      if (!field) { unmatched.push(msg); return; }
      field.classList.add('has-error');
      const err = document.createElement('div');
      err.className = 'field-error';
      err.textContent = msg;
      field.appendChild(err);
      if (!first) first = field;
    });
    if (unmatched.length) UI.alert(root, unmatched.join(' '));
    if (first) {
      const inp = first.querySelector('input,textarea,select');
      if (inp) inp.focus({ preventScroll: true });
      first.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  },
  alert(root, message) {
    $$('.form-alert', root).forEach(e => e.remove());
    const el = document.createElement('div');
    el.className = 'form-alert';
    el.setAttribute('role', 'alert');
    el.innerHTML = html`${icon('info', 18)}<span>${message}</span>`;
    root.prepend(el);
  },
  handleError(err, root = null) {
    if (!(err instanceof ApiError)) console.warn('[UI]', err);
    if (err && err.code === 'UNAUTHORIZED') { App.onUnauthorized(); return; }
    if (root && err && err.fields) { UI.fieldErrors(root, err.fields); return; }
    if (root) { UI.alert(root, (err && err.message) || 'Unbekannter Fehler.'); return; }
    UI.toast({ icon: '⚠️', title: 'Das hat nicht geklappt', text: (err && err.message) || 'Bitte versuch es noch einmal.' });
  },
};

/* ---------- Like-Dialog (optional mit Nachricht, wie bei Hinge) ---------- */
const LikeSheet = {
  open({ idea, owner, onSend }) {
    const quick = ['Klingt perfekt! 😍', 'Da wollte ich schon immer mal hin!', 'Ich bring gute Laune mit ☀️', 'Bin dabei – wann passt es dir?'];
    UI.sheet({
      title: `Bei ${owner.name} dabei sein?`,
      subtitle: 'Optional: Schreib eine kurze Nachricht dazu.',
      body: html`<div class="like-preview">${UI.ideaThumb(idea)}<div style="min-width:0"><span class="t">${idea.title}</span><span class="s">${owner.name}, ${owner.age} · ${shortCity(owner.city)}</span></div></div>
        <div class="field"><label class="label" for="like-msg">Deine Nachricht <span class="count">0/200</span></label>
          <textarea id="like-msg" class="textarea" maxlength="200" placeholder="z. B. Da war ich noch nie – zeigst du mir deinen Lieblingsplatz?"></textarea></div>
        <div class="quick-msgs">${quick.map(q => html`<button type="button" class="chip sm" data-quick="${q}">${q}</button>`)}</div>`,
      foot: html`<button type="button" class="btn btn-secondary" data-close>Abbrechen</button><button type="button" class="btn btn-primary" style="flex:1" data-send>${icon('heartFill', 18)} Like senden</button>`,
      onMount(sheet, close) {
        const ta = $('textarea', sheet);
        const count = $('.count', sheet);
        ta.addEventListener('input', () => { count.textContent = `${ta.value.length}/200`; });
        ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { close(); onSend(ta.value.trim()); } });
        sheet.addEventListener('click', e => {
          const q = e.target.closest('[data-quick]');
          if (q) { ta.value = q.dataset.quick; ta.dispatchEvent(new Event('input')); ta.focus(); }
          if (e.target.closest('[data-send]')) { close(); onSend(ta.value.trim()); }
        });
        setTimeout(() => ta.focus({ preventScroll: true }), 380);
      },
    });
  },
};

/* ---------- Match-Overlay (mit Konfetti) ---------- */
const MatchOverlay = {
  queue: [],
  showing: false,
  show(payload) {
    if (!payload || !payload.matchId) return;
    if (this.queue.some(p => p.matchId === payload.matchId)) return;
    this.queue.push(payload);
    if (!this.showing) this.next();
  },
  next() {
    const p = this.queue.shift();
    if (!p) { this.showing = false; return; }
    this.showing = true;
    const colors = ['#FFFFFF', '#FFD166', '#FF8A5B', '#FFC2D1', '#9BE7C4', '#B8A1FF'];
    const confetti = Array.from({ length: 46 }, () => {
      const left = Math.random() * 100, dur = 2.4 + Math.random() * 2.2, delay = Math.random() * 0.9, rot = Math.random() * 360;
      const w = 6 + Math.random() * 6, h = 9 + Math.random() * 8;
      return `<i style="left:${left.toFixed(1)}%;background:${Util.pick(colors)};width:${w.toFixed(0)}px;height:${h.toFixed(0)}px;animation-duration:${dur.toFixed(2)}s;animation-delay:${delay.toFixed(2)}s;transform:rotate(${rot.toFixed(0)}deg)"></i>`;
    }).join('');
    const me = p.me || App.user;
    const el = document.createElement('div');
    el.className = 'match';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Neues Match');
    el.innerHTML = html`<div class="confetti" aria-hidden="true">${raw(confetti)}</div>
      <p class="match-kicker">Neues Match</p>
      <h2 class="match-title">Ihr seid dabei!</h2>
      <div class="match-avatars">${UI.avatar(me, 104, 'left')}<span class="match-heart">${icon('heartFill', 26)}</span>${UI.avatar(p.other, 104, 'right')}</div>
      <p class="match-text">Du und ${p.other.name} habt einen Plan:</p>
      <div class="match-idea">${UI.ideaThumb(p.idea)}<div style="min-width:0"><div class="k">Geplantes Date</div><div class="t">${p.idea.title}</div></div></div>
      <div class="match-actions">
        <button type="button" class="btn btn-light btn-block" data-m="chat">${icon('chat', 19)} Nachricht an ${p.other.name}</button>
        <button type="button" class="btn btn-outline btn-block" data-m="close">Weiter entdecken</button>
      </div>`;
    const close = () => { el.classList.add('out'); setTimeout(() => { el.remove(); MatchOverlay.next(); }, 300); };
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-m]');
      if (!b) return;
      close();
      if (b.dataset.m === 'chat') App.go('#/chat/' + p.matchId);
    });
    $('#overlay-root').appendChild(el);
    setTimeout(() => { const b = el.querySelector('[data-m="chat"]'); if (b) b.focus({ preventScroll: true }); }, 900);
    App.refreshBadges();
  },
  closeAll() { this.queue = []; $$('#overlay-root > .match').forEach(e => e.remove()); this.showing = false; },
};

/* =============================================================================
   ROUTER & APP-ZUSTAND
   ============================================================================= */
const TABS = [
  { id: 'feed', label: t('tabs.feed'), icon: 'compass', hash: '#/feed' },
  { id: 'requests', label: t('tabs.requests'), icon: 'heart', hash: '#/requests', badge: 'requests' },
  { id: 'chats', label: t('tabs.chats'), icon: 'chat', hash: '#/chats', badge: 'chats' },
  { id: 'dates', label: t('tabs.dates'), icon: 'calendar', hash: '#/dates' },
  { id: 'profile', label: t('tabs.profile'), icon: 'user', hash: '#/profile' },
];

function makeCtx(route, params) {
  const ctx = {
    route, params, alive: true, cleanups: [],
    on(type, fn) { ctx.cleanups.push(DataService.on(type, d => { if (ctx.alive) fn(d); })); },
    listen(target, type, fn, opts) { target.addEventListener(type, fn, opts); ctx.cleanups.push(() => target.removeEventListener(type, fn, opts)); },
    timeout(fn, ms) { const t = setTimeout(() => { if (ctx.alive) fn(); }, ms); ctx.cleanups.push(() => clearTimeout(t)); },
    destroy() {
      ctx.alive = false;
      ctx.cleanups.forEach(f => { try { f(); } catch (e) { /* ignorieren */ } });
      ctx.cleanups = [];
    },
  };
  return ctx;
}

const App = {
  user: null,
  view: null,
  stack: [],
  navToken: 0,
  activeChatId: null,
  badges: { requests: 0, chats: 0 },
  filters: { categories: [], budgets: [], times: [], maxDistance: null },
  requestsSeg: 'received',

  routes() {
    return [
      { name: 'login', re: /^#\/login$/, view: LoginView, guest: true, depth: 0 },
      { name: 'register', re: /^#\/register$/, view: RegisterView, guest: true, depth: 1 },
      { name: 'onboarding', re: /^#\/onboarding$/, view: OnboardingView, depth: 0 },
      { name: 'feed', re: /^#\/feed$/, view: FeedView, tab: 'feed', depth: 0 },
      { name: 'requests', re: /^#\/requests$/, view: RequestsView, tab: 'requests', depth: 0 },
      { name: 'chats', re: /^#\/chats$/, view: ChatsView, tab: 'chats', depth: 0 },
      { name: 'chat', re: /^#\/chat\/([\w-]+)$/, view: ChatView, depth: 1 },
      { name: 'dates', re: /^#\/dates$/, view: DatesView, tab: 'dates', depth: 0 },
      { name: 'profile', re: /^#\/profile$/, view: ProfileView, tab: 'profile', depth: 0 },
      { name: 'profile-edit', re: /^#\/profile\/edit$/, view: ProfileEditView, depth: 1 },
      { name: 'idea-new', re: /^#\/ideas\/new$/, view: IdeaEditView, depth: 2 },
      { name: 'idea-edit', re: /^#\/ideas\/([\w-]+)\/edit$/, view: IdeaEditView, depth: 2 },
      { name: 'user', re: /^#\/user\/([\w-]+)$/, view: UserProfileView, depth: 2 },
    ];
  },
  needsOnboarding(u) { return !!u && (!u.profileComplete || !u.botLikesSeeded); },
  homeFor(u) { return !u ? '#/login' : this.needsOnboarding(u) ? '#/onboarding' : '#/feed'; },

  go(hash, { replace = false } = {}) {
    if (replace) { history.replaceState(null, '', hash); this.navigate({ replace: true }); }
    else if (location.hash === hash) this.navigate({ replace: true });
    else location.hash = hash;
  },
  back(fallback = '#/feed') {
    if (this.stack.length > 1) history.back();
    else this.go(fallback, { replace: true });
  },
  async refreshUser() {
    try { this.user = await DataService.getCurrentUser(); } catch (e) { this.user = null; }
    return this.user;
  },
  onUnauthorized() {
    this.user = null;
    UI.toast({ icon: '🔒', title: 'Bitte melde dich erneut an' });
    this.stack = [];
    this.go('#/login', { replace: true });
  },

  async navigate(opts = {}) {
    const token = ++this.navToken;
    const hash = location.hash || '#/';
    const routes = this.routes();
    let route = null, params = [];
    for (const r of routes) { const m = hash.match(r.re); if (m) { route = r; params = m.slice(1); break; } }
    const u = this.user;
    // ---- Zugriffsschutz: ohne Login nur Login/Registrierung ----
    if (!route) return this.go(this.homeFor(u), { replace: true });
    if (route.guest && u) return this.go(this.homeFor(u), { replace: true });
    if (!route.guest && !u) return this.go('#/login', { replace: true });
    if (u && !route.guest) {
      const needs = this.needsOnboarding(u);
      if (needs && route.name !== 'onboarding') return this.go('#/onboarding', { replace: true });
      if (!needs && route.name === 'onboarding') return this.go('#/feed', { replace: true });
    }
    // ---- Verlauf & Richtung der Animation ----
    let isBack = false;
    if (opts.replace) { if (this.stack.length) this.stack[this.stack.length - 1] = hash; else this.stack.push(hash); }
    else if (this.stack.length > 1 && this.stack[this.stack.length - 2] === hash) { this.stack.pop(); isBack = true; }
    else if (this.stack[this.stack.length - 1] !== hash) this.stack.push(hash);
    if (this.stack.length > 60) this.stack = this.stack.slice(-60);

    const old = this.view;
    if (old && old.hash === hash && !opts.replace && !opts.force) return;
    let dir = 'fade';
    if (!old) dir = 'rise';
    else if (isBack) dir = 'back';
    else if (route.tab && old.route.tab) dir = 'fade';
    else if (route.tab || route.name === 'login' || route.name === 'onboarding') dir = (route.depth < old.route.depth) ? 'back' : 'fade';
    else dir = 'forward';

    document.body.classList.toggle('detail-view', !route.tab && !route.guest);
    const section = document.createElement('section');
    section.className = 'view' + (route.tab ? ' with-tabbar' : '');
    section.dataset.view = route.name;
    const ctx = makeCtx(route, params);
    this.view = { route, hash, section, ctx };
    this.renderTabbar(route.tab);
    $('#views').appendChild(section);

    if (old) {
      old.ctx.destroy();
      old.section.classList.add('leave-' + dir);
      old.section.setAttribute('aria-hidden', 'true');
      setTimeout(() => old.section.remove(), dir === 'fade' ? 220 : 380);
    }
    section.classList.add('enter-' + dir);
    setTimeout(() => section.classList.remove('enter-' + dir), 450);

    if (u && !this.needsOnboarding(u)) this.refreshBadges();
    try {
      await route.view.render(section, params, ctx);
    } catch (err) {
      if (token !== this.navToken || !ctx.alive) return;
      if (err && err.code === 'UNAUTHORIZED') return this.onUnauthorized();
      console.error(err);
      section.innerHTML = html`<header class="topbar"><button class="icon-btn back" data-action="back" aria-label="Zurück">${icon('back')}</button></header>${UI.errorState(err)}`;
      section.addEventListener('click', e => { if (e.target.closest('[data-action="retry"]')) this.navigate({ replace: true, force: true }); });
    }
  },

  renderTabbar(activeTab) {
    const bar = $('#tabbar');
    if (!activeTab) { bar.classList.add('hide'); return; }
    bar.hidden = false;
    bar.classList.remove('hide');
    bar.innerHTML = html`${TABS.map(t => {
      const n = t.badge ? this.badges[t.badge] : 0;
      return html`<button type="button" class="tab ${t.id === activeTab ? 'active' : ''}" data-go="${t.hash}" data-tab="${t.id}" aria-label="${t.label}${n ? ` (${n} neu)` : ''}" ${t.id === activeTab ? raw('aria-current="page"') : ''}>
        ${icon(t.icon, 24, t.id === activeTab ? 2.3 : 2)}<span>${t.label}</span>${n ? html`<span class="tab-badge">${n > 9 ? '9+' : n}</span>` : ''}</button>`;
    })}`;
  },
  updateTabBadges() {
    TABS.filter(t => t.badge).forEach(t => {
      const btn = $(`#tabbar [data-tab="${t.id}"]`);
      if (!btn) return;
      const n = this.badges[t.badge] || 0;
      let b = $('.tab-badge', btn);
      if (!n) { if (b) b.remove(); return; }
      if (!b) { b = document.createElement('span'); b.className = 'tab-badge'; btn.appendChild(b); }
      const txt = n > 9 ? '9+' : String(n);
      if (b.textContent !== txt) b.textContent = txt;
      btn.setAttribute('aria-label', `${t.label} (${n} neu)`);
    });
  },
  refreshBadges: Util.debounce(async () => {
    if (!App.user || App.needsOnboarding(App.user)) return;
    try {
      App.badges = await DataService.getBadges();
      App.updateTabBadges();
    } catch (e) { /* still */ }
  }, 180),

  async onSession(d) {
    const prevId = this.user ? this.user.id : null;
    if (d && d.external) {
      // Session-Änderung in einem anderen Tab: nur reagieren, wenn dieser Tab betroffen ist
      await this.refreshUser();
      if ((this.user ? this.user.id : null) === prevId) { DevPanel.refresh(); return; }
    } else if (d && d.user) this.user = d.user;
    else this.user = null;
    MatchOverlay.closeAll();
    UI.closeOverlays();
    this.stack = [];
    this.badges = { requests: 0, chats: 0 };
    if (this.view) { this.view.hash = null; }
    this.go(this.homeFor(this.user), { replace: true });
    this.refreshBadges();
    DevPanel.refresh();
  },

  async boot() {
    $('#pitch-logo').innerHTML = html`${logoMark()}<span class="word">asap<i>.</i></span>`;
    const tick = () => { const el = $('#sb-time'); if (el) el.textContent = Fmt.time(Date.now()); };
    tick();
    setInterval(tick, 20000);
    $('#views').innerHTML = html`<section class="view"><div class="splash">${logo('lg')}<div class="spinner"></div></div></section>`;
    DataService.on('network', d => $('#netbar').classList.toggle('on', d.pending > 0));
    DevPanel.init();

    await DataService.init();
    await this.refreshUser();
    $('#views').innerHTML = '';

    // ---- Globale Ereignisse (später: WebSocket/Push vom Backend) ----
    DataService.on('change', () => { this.refreshBadges(); DevPanel.refreshSoon(); });
    DataService.on('match', d => MatchOverlay.show(d));
    DataService.on('message', d => {
      if (this.activeChatId === d.matchId) return;
      UI.toast({ icon: '💬', title: d.senderName, text: d.message.text, onClick: () => this.go('#/chat/' + d.matchId) });
    });
    DataService.on('request', d => {
      UI.toast({ icon: '❤️', title: `${d.fromName} ist dabei!`, text: `… bei deiner Idee „${d.ideaTitle}“`, onClick: () => this.go('#/requests') });
    });
    DataService.on('proposal', d => {
      if (this.activeChatId === d.matchId) return;
      const ok = d.proposal.status === 'confirmed';
      UI.toast({ icon: ok ? '🎉' : '🙈', title: ok ? `${d.byName} hat zugesagt!` : `${d.byName} kann leider nicht`, text: Fmt.dateTimeLong(d.proposal.dateTime), onClick: () => this.go('#/chat/' + d.matchId) });
    });
    DataService.on('session', d => this.onSession(d));
    DataService.on('sync', () => { const v = this.view; if (v && v.route.view.onSync) v.route.view.onSync(v.ctx); });

    // ---- Globale Navigation per data-go / Zurück-Buttons ----
    document.addEventListener('click', e => {
      const back = e.target.closest('[data-action="back"]');
      if (back && $('#app').contains(back)) { e.preventDefault(); this.back(back.dataset.fallback || '#/feed'); return; }
      const go = e.target.closest('[data-go]');
      if (go && $('#app').contains(go)) { e.preventDefault(); this.go(go.dataset.go); }
    });
    window.addEventListener('hashchange', () => this.navigate());
    if (!location.hash || location.hash === '#' || location.hash === '#/') history.replaceState(null, '', this.homeFor(this.user));
    this.navigate({ replace: true });
    this.refreshBadges();
  },
};

export { $, $$, FALLBACK_GRADIENTS, shortCity, catStyle, bindSubmit, toggleIn, UI, LikeSheet, MatchOverlay, TABS, makeCtx, App };
