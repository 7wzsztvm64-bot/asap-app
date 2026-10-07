import { Util, escapeHtml, raw, html, Fmt, icon, logo, CATEGORIES, CAT, BUDGETS, TIMES, TIME } from './core.js';
import { DataService } from './dataService.js';
import { $, $$, shortCity, toggleIn, UI, LikeSheet, MatchOverlay, App } from './uiCore.js';

/* =============================================================================
   ANSICHTEN: Entdecken (Feed mit Swipe), Anfragen, Profil anderer Personen
   ============================================================================= */
function activeFilterCount(f = App.filters) {
  return f.categories.length + f.budgets.length + f.times.length + (f.maxDistance ? 1 : 0);
}

const FeedView = {
  async render(el, params, ctx) {
    el.innerHTML = html`
      <header class="topbar feed-head">${logo()}
        <div class="actions"><button type="button" class="icon-btn" data-action="filters" aria-label="Filter">${icon('filter')}<span class="dot" hidden></span></button></div>
      </header>
      <div class="deck-wrap">
        <div class="filter-summary" hidden></div>
        <div class="deck"></div>
        <div class="deck-actions">
          <button type="button" class="round-btn pass" data-action="pass" aria-label="Überspringen (Pfeil links)">${icon('close', 26, 2.4)}</button>
          <button type="button" class="round-btn msg" data-action="comment" aria-label="Mit Nachricht liken">${icon('chat', 20)}</button>
          <button type="button" class="round-btn like" data-action="like" aria-label="Dabei – Idee liken (Pfeil rechts)">${icon('heartFill', 22)} Dabei!</button>
        </div>
      </div>`;
    const deck = $('.deck', el);
    const actions = $('.deck-actions', el);
    const state = { items: [], busy: false };

    const skeleton = () => html`<div class="icard-skel"><div class="skeleton hero"></div><div class="lines">
      <div class="skeleton sk-line" style="width:70%;height:16px"></div><div class="skeleton sk-line" style="width:92%"></div>
      <div class="skeleton sk-line" style="width:60%"></div><div class="skeleton sk-line" style="width:45%;height:28px;margin-top:6px"></div></div></div>`;
    const setActions = on => { actions.style.visibility = 'visible'; $$('.round-btn', actions).forEach(b => { b.disabled = !on; }); };

    function renderFilterSummary() {
      const f = App.filters;
      const n = activeFilterCount();
      const dot = $('[data-action="filters"] .dot', el);
      dot.hidden = !n; dot.textContent = n;
      const box = $('.filter-summary', el);
      const chips = [
        ...f.categories.map(v => ({ k: 'categories', v, label: `${CAT[v].emoji} ${v}` })),
        ...f.budgets.map(v => ({ k: 'budgets', v, label: v })),
        ...f.times.map(v => ({ k: 'times', v, label: `${TIME[v].emoji} ${v}` })),
        ...(f.maxDistance ? [{ k: 'maxDistance', v: '', label: `≤ ${Fmt.km(f.maxDistance)}` }] : []),
      ];
      box.hidden = !chips.length;
      box.innerHTML = html`${chips.map(c => html`<button type="button" class="chip sm is-on" data-unfilter="${c.k}" data-v="${c.v}" aria-label="Filter ${c.label} entfernen">${c.label} <span class="x">${icon('close', 13, 2.6)}</span></button>`)}`;
    }

    async function load() {
      deck.innerHTML = skeleton();
      setActions(false);
      renderFilterSummary();
      try {
        const res = await DataService.getFeed(App.filters);
        if (!ctx.alive) return;
        if (res.locked) return renderGate();
        state.items = res.items;
        renderDeck();
      } catch (err) {
        if (!ctx.alive) return;
        if (err.code === 'UNAUTHORIZED') return App.onUnauthorized();
        deck.innerHTML = UI.errorState(err);
        setActions(false);
      }
    }
    function cardEl(item, posClass) {
      const tmp = document.createElement('div');
      tmp.innerHTML = UI.ideaCard(item, { variant: 'swipe', posClass });
      return tmp.firstElementChild;
    }
    function renderDeck() {
      if (!state.items.length) return renderEmpty();
      deck.innerHTML = '';
      const visible = state.items.slice(0, 3);
      for (let i = visible.length - 1; i >= 0; i--) deck.appendChild(cardEl(visible[i], i === 0 ? 'top' : 'pos-' + i));
      attachDrag($('.icard.top', deck));
      setActions(true);
    }
    function renderEmpty() {
      setActions(false);
      actions.style.visibility = 'hidden';
      const filtered = activeFilterCount() > 0;
      deck.innerHTML = html`<div style="height:100%;display:flex;align-items:center;justify-content:center;overflow:auto">${UI.empty({
        emoji: '🧭', title: 'Keine neuen Ideen in deiner Nähe',
        text: filtered ? 'Mit deinen aktuellen Filtern gibt es gerade nichts Neues. Lockere sie doch ein bisschen.' : 'Du hast alle Ideen gesehen. Schau später wieder vorbei – oder gib übersprungenen Ideen eine zweite Chance.',
        actions: [
          ...(filtered ? [{ label: 'Filter zurücksetzen', action: 'clear-filters' }] : []),
          { label: 'Übersprungene erneut zeigen', action: 'reset-passes', icon: 'refresh', kind: filtered ? 'btn-secondary' : 'btn-primary' },
          { label: 'Eigene Idee hinzufügen', go: '#/ideas/new', kind: 'btn-ghost' },
        ] })}</div>`;
    }
    function renderGate() {
      actions.style.visibility = 'hidden';
      deck.innerHTML = html`<div style="height:100%;display:flex;align-items:center;justify-content:center">${UI.empty({
        emoji: '💡', title: 'Erst deine Idee, dann der Feed',
        text: 'Bei asap likest du Ideen – und andere deine. Leg mindestens eine aktive Date-Idee an (oder aktiviere eine pausierte), dann geht\'s los.',
        actions: [{ label: 'Idee anlegen', go: '#/ideas/new', icon: 'plus' }, { label: 'Meine Ideen verwalten', go: '#/profile', kind: 'btn-ghost' }] })}</div>`;
    }

    /* ---- Swipe-Gesten (Maus & Touch über Pointer Events) ---- */
    function attachDrag(card) {
      if (!card) return;
      let sx = 0, sy = 0, dx = 0, dy = 0, t0 = 0, active = false, pid = null;
      const likeStamp = $('.stamp-like', card), passStamp = $('.stamp-pass', card);
      card.addEventListener('pointerdown', e => {
        if (state.busy || e.target.closest('[data-go],[data-action]')) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        active = true; pid = e.pointerId; sx = e.clientX; sy = e.clientY; dx = 0; dy = 0; t0 = performance.now();
        try { card.setPointerCapture(pid); } catch (err) { /* ignorieren */ }
        card.style.transition = 'none';
      });
      card.addEventListener('pointermove', e => {
        if (!active || e.pointerId !== pid) return;
        dx = e.clientX - sx; dy = e.clientY - sy;
        card.style.transform = `translate(${dx}px, ${dy * 0.25}px) rotate(${dx / 16}deg)`;
        const p = Math.min(1, Math.abs(dx) / 110);
        likeStamp.style.opacity = dx > 0 ? p : 0;
        passStamp.style.opacity = dx < 0 ? p : 0;
      });
      const end = e => {
        if (!active || e.pointerId !== pid) return;
        active = false;
        const v = dx / Math.max(1, performance.now() - t0);
        if (dx > 110 || (dx > 50 && v > 0.55)) decide('like');
        else if (dx < -110 || (dx < -50 && v < -0.55)) decide('pass');
        else {
          card.style.transition = 'transform .45s var(--spring)';
          card.style.transform = '';
          likeStamp.style.opacity = 0; passStamp.style.opacity = 0;
        }
      };
      card.addEventListener('pointerup', end);
      card.addEventListener('pointercancel', end);
    }
    function flyOut(card, type) {
      const dir = type === 'like' ? 1 : -1;
      card.classList.add('gone');
      card.classList.remove('top');
      const stamp = $(type === 'like' ? '.stamp-like' : '.stamp-pass', card);
      if (stamp) stamp.style.opacity = 1;
      card.style.transition = 'transform .5s cubic-bezier(.3,.6,.35,1), opacity .5s ease';
      card.style.pointerEvents = 'none';
      requestAnimationFrame(() => {
        card.style.transform = `translate(${dir * 560}px, -40px) rotate(${dir * 26}deg)`;
        card.style.opacity = '0';
      });
      setTimeout(() => card.remove(), 520);
    }
    function advance() {
      state.items.shift();
      const rest = $$('.icard:not(.gone)', deck).reverse(); // vorderste zuerst
      rest.forEach((c, i) => { c.classList.remove('top', 'pos-1', 'pos-2', 'pos-hidden'); c.classList.add(i === 0 ? 'top' : 'pos-' + i); });
      const nextItem = state.items[2];
      if (nextItem) {
        const c = cardEl(nextItem, 'pos-hidden');
        deck.insertBefore(c, deck.firstChild);
        requestAnimationFrame(() => requestAnimationFrame(() => { c.classList.remove('pos-hidden'); c.classList.add('pos-2'); }));
      }
      if (!state.items.length) setTimeout(() => { if (ctx.alive && !state.items.length) renderEmpty(); }, 260);
      else attachDrag($('.icard.top', deck));
    }
    async function decide(type, opts = {}) {
      if (state.busy || !state.items.length) return;
      const card = $('.icard.top', deck);
      if (!card) return;
      const item = state.items[0];
      state.busy = true;
      flyOut(card, type);
      setTimeout(() => { state.busy = false; if (ctx.alive) advance(); }, 170);
      try {
        if (type === 'like') {
          await DataService.likeIdea(item.idea.id, opts.message || '');
          // Beim ersten Like (und bei Likes mit Nachricht) kurz erklären, wo die Anfrage landet
          if (opts.message || !FeedView.likeHintShown) {
            FeedView.likeHintShown = true;
            UI.toast({ icon: '❤️', title: `Anfrage an ${item.owner.name} gesendet`, text: opts.message ? `„${opts.message}“` : `${item.owner.name} sieht deinen Like jetzt unter „Anfragen“.`, light: true, duration: 2400 });
          }
        } else {
          await DataService.passIdea(item.idea.id);
        }
      } catch (err) {
        UI.handleError(err);
      }
    }

    function openFilters() {
      const f = JSON.parse(JSON.stringify(App.filters));
      const chip = (k, v, label) => html`<button type="button" class="chip ${f[k].includes(v) ? 'is-on' : ''}" data-k="${k}" data-v="${v}">${label}</button>`;
      UI.sheet({
        title: 'Filter', subtitle: 'Welche Ideen möchtest du sehen?',
        body: html`
          <div class="field"><span class="label">Kategorie</span><div class="chips">${CATEGORIES.map(c => chip('categories', c.label, `${c.emoji} ${c.label}`))}</div></div>
          <div class="field"><span class="label">Budget</span><div class="chips">${BUDGETS.map(b => chip('budgets', b.value, raw(`${escapeHtml(b.value)} <span style="font-weight:500;opacity:.7">${escapeHtml(b.label)}</span>`)))}</div></div>
          <div class="field"><span class="label">Tageszeit</span><div class="chips">${TIMES.map(t => chip('times', t.value, `${t.emoji} ${t.value}`))}</div></div>
          <div class="field"><label class="label" for="f-dist">Maximale Entfernung <span class="range-val">${f.maxDistance ? Fmt.km(f.maxDistance) : 'egal'}</span></label>
            <input id="f-dist" class="range" type="range" min="2" max="50" step="1" value="${f.maxDistance || 50}">
            <span class="hint">Simulierter Wert auf Basis der Stadtteile im Raum Frankfurt.</span></div>`,
        foot: html`<button type="button" class="btn btn-ghost" data-reset>Zurücksetzen</button><button type="button" class="btn btn-primary" style="flex:1" data-apply>Ideen anzeigen</button>`,
        onMount(sheet, close) {
          const range = $('#f-dist', sheet), val = $('.range-val', sheet);
          range.addEventListener('input', () => { const v = Number(range.value); f.maxDistance = v >= 50 ? null : v; val.textContent = f.maxDistance ? Fmt.km(v) : 'egal'; });
          sheet.addEventListener('click', e => {
            const c = e.target.closest('[data-k]');
            if (c) { toggleIn(f[c.dataset.k], c.dataset.v); c.classList.toggle('is-on'); }
            if (e.target.closest('[data-reset]')) {
              f.categories = []; f.budgets = []; f.times = []; f.maxDistance = null;
              $$('.chip.is-on', sheet).forEach(x => x.classList.remove('is-on'));
              range.value = 50; val.textContent = 'egal';
            }
            if (e.target.closest('[data-apply]')) { App.filters = f; close(); load(); }
          });
        },
      });
    }

    el.addEventListener('click', async e => {
      const t = e.target.closest('[data-action],[data-unfilter]');
      if (!t) return;
      if (t.dataset.unfilter) {
        const k = t.dataset.unfilter;
        if (k === 'maxDistance') App.filters.maxDistance = null; else toggleIn(App.filters[k], t.dataset.v);
        return load();
      }
      switch (t.dataset.action) {
        case 'like': return decide('like');
        case 'pass': return decide('pass');
        case 'comment': {
          const item = state.items[0];
          if (!item || state.busy) return;
          return LikeSheet.open({ idea: item.idea, owner: item.owner, onSend: message => decide('like', { message }) });
        }
        case 'filters': return openFilters();
        case 'clear-filters': App.filters = { categories: [], budgets: [], times: [], maxDistance: null }; return load();
        case 'reset-passes': {
          UI.busy(t, true);
          try {
            const n = await DataService.resetPasses();
            UI.toast({ icon: '🔁', title: n ? `${n} Idee${n === 1 ? '' : 'n'} wieder im Feed` : 'Keine übersprungenen Ideen', light: true, duration: 2200 });
          } catch (err) { UI.handleError(err); }
          return load();
        }
        case 'retry': return load();
      }
    });
    ctx.listen(document, 'keydown', e => {
      if ($('#overlay-root > *') || e.target.closest('input,textarea,select,[contenteditable]')) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); decide('like'); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); decide('pass'); }
    });
    await load();
  },
};

/* ---------- Anfragen ---------- */
const RequestsView = {
  async render(el, params, ctx) {
    let seg = App.requestsSeg || 'received';
    let data = null, sig = '';
    el.innerHTML = html`<header class="topbar"><h1>Anfragen</h1></header>
      <div style="padding:0 18px 12px;flex:none"><div class="seg" role="tablist" aria-label="Anfragen filtern">
        <button type="button" role="tab" data-seg="received">Für dich <span class="n" hidden></span></button>
        <button type="button" role="tab" data-seg="sent">Gesendet</button></div></div>
      <div class="scroll"><div class="pad list">${UI.skeletonList(3)}</div></div>`;
    const list = $('.list', el);

    function receivedCard(r) {
      return html`<article class="req-card" data-like="${r.id}">
        <button type="button" class="req-head" data-go="#/user/${r.from.id}">
          ${UI.avatar(r.from, 52)}
          <span><span class="rn">${r.from.name}, ${r.from.age}</span><span class="rs">${shortCity(r.from.city)} · ${Fmt.km(r.from.distanceKm)}</span></span>
          <span class="rt">${Fmt.relative(r.createdAt)}</span>
        </button>
        <div class="req-label">${icon('heartFill', 14)} will bei deiner Idee dabei sein</div>
        <div class="req-idea">${UI.ideaThumb(r.idea, 'sm')}<div style="min-width:0"><div class="t">${r.idea.title}</div><div class="s">${r.idea.category} · ${r.idea.budget} · ${r.idea.timeOfDay}</div></div></div>
        ${r.message ? html`<div class="quote">„${r.message}“</div>` : ''}
        ${r.from.sharedInterests.length ? html`<div class="chips" style="margin-top:12px">${r.from.sharedInterests.slice(0, 4).map(t => html`<span class="tag shared">${t}</span>`)}</div>` : ''}
        <div class="req-actions">
          <button type="button" class="btn btn-secondary" data-action="decline" data-like="${r.id}">${icon('close', 18)} Ablehnen</button>
          <button type="button" class="btn btn-primary" data-action="accept" data-like="${r.id}">${icon('check', 18)} Annehmen</button>
        </div></article>`;
    }
    function sentRow(s) {
      const go = s.status === 'matched' ? `#/chat/${s.matchId}` : `#/user/${s.owner.id}`;
      return html`<button type="button" class="sent-row" data-go="${go}">
        ${UI.ideaThumb(s.idea)}
        <span class="grow"><span class="t">${s.idea.title}</span>
          <span class="s">${s.owner.name}, ${s.owner.age} · ${Fmt.relative(s.createdAt)}${s.message ? ` · „${s.message}“` : ''}</span></span>
        ${s.status === 'matched' ? html`<span class="pill primary">Match 🎉</span>` : html`<span class="pill gray">Offen</span>`}
      </button>`;
    }
    function render() {
      $$('[data-seg]', el).forEach(b => { b.classList.toggle('is-on', b.dataset.seg === seg); b.setAttribute('aria-selected', b.dataset.seg === seg); });
      const n = $('[data-seg="received"] .n', el);
      n.hidden = !data.received.length; n.textContent = data.received.length;
      if (seg === 'received') {
        list.innerHTML = data.received.length
          ? html`<div class="info-note">${icon('info', 18)}<span>Nimmst du an, entsteht ein Match und die Idee wird euer geplantes Date. Lehnst du ab, erfährt die Person nichts davon.</span></div>${data.received.map(receivedCard)}`
          : UI.empty({ emoji: '💌', title: 'Noch keine Anfragen', text: 'Sobald jemand bei einer deiner Ideen dabei sein will, siehst du es hier. Tipp: Je konkreter die Idee, desto mehr Anfragen.',
            actions: [{ label: 'Neue Idee anlegen', go: '#/ideas/new', icon: 'plus' }, { label: 'Ideen entdecken', go: '#/feed', kind: 'btn-ghost' }] });
      } else {
        list.innerHTML = data.sent.length
          ? html`<div class="info-note">${icon('info', 18)}<span>Deine Likes landen bei der Person hinter der Idee. Solange sie nicht angenommen wurden, bleiben sie hier „offen“.</span></div>${data.sent.map(sentRow)}`
          : UI.empty({ emoji: '✉️', title: 'Noch nichts gesendet', text: 'Like Ideen im Feed – deine Anfragen erscheinen dann hier.', actions: [{ label: 'Ideen entdecken', go: '#/feed' }] });
      }
    }
    async function load(silent = false) {
      if (!silent) list.innerHTML = UI.skeletonList(3);
      try {
        const [received, sent] = await Promise.all([DataService.getRequests(), DataService.getSentLikes()]);
        if (!ctx.alive) return;
        const s = JSON.stringify([received, sent]);
        if (silent && s === sig) return;
        sig = s;
        data = { received, sent };
        render();
      } catch (err) {
        if (!ctx.alive) return;
        if (err.code === 'UNAUTHORIZED') return App.onUnauthorized();
        list.innerHTML = UI.errorState(err);
      }
    }
    el.addEventListener('click', async e => {
      const segBtn = e.target.closest('[data-seg]');
      if (segBtn && data) { seg = App.requestsSeg = segBtn.dataset.seg; render(); $('.scroll', el).scrollTop = 0; return; }
      const t = e.target.closest('[data-action]');
      if (!t) return;
      if (t.dataset.action === 'retry') return load();
      const likeId = t.dataset.like;
      const req = data && data.received.find(r => r.id === likeId);
      if (!req || UI.isBusy(t)) return;
      const card = t.closest('.req-card');
      UI.busy(t, true);
      $$('button', card).forEach(b => { if (b !== t) b.disabled = true; });
      try {
        const accept = t.dataset.action === 'accept';
        const res = await DataService.respondToLike(likeId, accept);
        card.classList.add(accept ? 'out-right' : 'out');
        setTimeout(() => { if (!ctx.alive) return; data.received = data.received.filter(r => r.id !== likeId); sig = ''; render(); }, 360);
        if (accept) MatchOverlay.show(res);
        else UI.toast({ icon: '👋', title: 'Anfrage abgelehnt', text: `${req.from.name} erfährt davon nichts.`, light: true, duration: 2400 });
        App.refreshBadges();
      } catch (err) {
        UI.busy(t, false);
        $$('button', card).forEach(b => { b.disabled = false; });
        UI.handleError(err);
        load(true);
      }
    });
    const reload = Util.debounce(() => { if (ctx.alive) load(true); }, 400);
    ctx.on('change', reload);
    await load();
  },
};

/* ---------- Profil einer anderen Person (mit allen aktiven Ideen) ---------- */
const UserProfileView = {
  async render(el, params, ctx) {
    const userId = params[0];
    el.innerHTML = html`<header class="topbar bordered"><button type="button" class="icon-btn back" data-action="back" aria-label="Zurück">${icon('back')}</button>
      <div class="topbar-title sm">Profil</div></header><div class="scroll"><div class="pad body">${UI.loading()}</div></div>`;
    const body = $('.body', el);
    let data = null;

    function ideaFooter(entry) {
      if (data.isMe) return html`<div class="card-foot"><span class="pill gray">Deine Idee</span></div>`;
      if (data.matchId) return html`<div class="card-foot"><span class="pill green">${icon('check', 13, 2.6)} Ihr habt schon ein Match</span></div>`;
      if (entry.liked) return html`<div class="card-foot"><span class="pill primary">${icon('heartFill', 13)} Anfrage gesendet</span></div>`;
      if (!data.compatible) return '';
      return html`<div class="card-foot"><span class="hint">Lust darauf?</span><button type="button" class="btn btn-primary btn-sm" data-action="like" data-idea="${entry.idea.id}">${icon('heartFill', 16)} Dabei!</button></div>`;
    }
    function render() {
      const u = data.user;
      $('.topbar-title', el).textContent = data.isMe ? 'So sehen dich andere' : u.name;
      const photos = u.photos.length ? u.photos : [null];
      body.innerHTML = html`
        <div class="gallery" aria-label="Profilbilder">${photos.map(p => UI.photoTile(p, u.name))}</div>
        ${photos.length > 1 ? html`<div class="gallery-dots" aria-hidden="true">${photos.map((p, i) => html`<i class="${i === 0 ? 'on' : ''}"></i>`)}</div>` : ''}
        <div class="up-head"><div class="n">${u.name}, ${u.age}</div>
          <div class="s"><span>${icon('pin', 15)} ${u.city}</span>${u.distanceKm != null ? html`<span>${icon('nav', 14)} ${Fmt.km(u.distanceKm)} entfernt</span>` : ''}</div></div>
        ${data.isMe ? html`<div class="banner"><div class="bt">${icon('eye', 18)} Vorschau deines öffentlichen Profils</div></div>` : ''}
        ${data.incoming.map(l => html`<div class="banner"><div class="bt">${icon('heartFill', 18)} ${u.name} will bei „${l.idea.title}“ dabei sein</div>
          ${l.message ? html`<div class="quote" style="margin:0;background:#fff">„${l.message}“</div>` : ''}
          <div class="req-actions" style="margin:0"><button type="button" class="btn btn-secondary" data-action="decline" data-like="${l.id}">Ablehnen</button>
          <button type="button" class="btn btn-primary" data-action="accept" data-like="${l.id}">${icon('check', 18)} Annehmen</button></div></div>`)}
        ${data.matchId ? html`<div class="banner green"><div class="bt">${icon('check', 18, 2.6)} Ihr habt ein Match!</div><button type="button" class="btn btn-primary btn-sm" data-go="#/chat/${data.matchId}">${icon('chat', 17)} Zum Chat</button></div>` : ''}
        <p class="bio ${u.bio ? '' : 'empty-bio'}">${u.bio || 'Noch keine Bio.'}</p>
        <div class="chips">${u.interests.map(t => html`<span class="tag ${u.sharedInterests.includes(t) ? 'shared' : ''}">${t}</span>`)}</div>
        <div class="section-title">${data.isMe ? 'Deine aktiven Ideen' : `Ideen von ${u.name}`} (${data.ideas.length})</div>
        ${data.ideas.length ? html`<div style="display:grid;gap:14px">${data.ideas.map(entry => UI.ideaCard({ idea: entry.idea, owner: null, distanceKm: null }, { variant: 'compact', footer: ideaFooter(entry) }))}</div>`
          : UI.empty({ emoji: '🌙', title: 'Gerade keine aktiven Ideen', text: `${u.name} hat aktuell keine Idee veröffentlicht.` })}
        ${!data.isMe && !data.compatible ? html`<p class="foot-note">Hinweis: Laut euren Profilangaben passt ihr nicht zueinander – deshalb kannst du hier nichts liken.</p>` : ''}`;
      const gallery = $('.gallery', body);
      const dots = $$('.gallery-dots i', body);
      if (gallery && dots.length) gallery.addEventListener('scroll', () => {
        const i = Math.round(gallery.scrollLeft / gallery.clientWidth);
        dots.forEach((d, j) => d.classList.toggle('on', i === j));
      }, { passive: true });
    }
    async function load() {
      try {
        data = await DataService.getUserProfile(userId);
        if (!ctx.alive) return;
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
      const a = t.dataset.action;
      if (a === 'retry') { body.innerHTML = UI.loading(); return load(); }
      if (a === 'like') {
        const entry = data.ideas.find(x => x.idea.id === t.dataset.idea);
        if (!entry) return;
        if (!data.canLike) {
          UI.toast({ icon: '💡', title: 'Erst eine eigene Idee anlegen', text: 'Ohne aktive Idee kannst du nichts liken.', onClick: () => App.go('#/ideas/new') });
          return;
        }
        LikeSheet.open({ idea: entry.idea, owner: data.user, onSend: async message => {
          UI.busy(t, true);
          try {
            await DataService.likeIdea(entry.idea.id, message);
            entry.liked = true;
            UI.toast({ icon: '❤️', title: `Anfrage an ${data.user.name} gesendet`, text: entry.idea.title, light: true, duration: 2200 });
            if (ctx.alive) render();
          } catch (err) { UI.busy(t, false); UI.handleError(err); }
        } });
      }
      if (a === 'accept' || a === 'decline') {
        UI.busy(t, true);
        try {
          const res = await DataService.respondToLike(t.dataset.like, a === 'accept');
          if (a === 'accept') MatchOverlay.show(res);
          else UI.toast({ icon: '👋', title: 'Anfrage abgelehnt', text: `${data.user.name} erfährt davon nichts.`, light: true, duration: 2200 });
          App.refreshBadges();
          await load();
        } catch (err) { UI.busy(t, false); UI.handleError(err); }
      }
    });
    await load();
  },
};

export { activeFilterCount, FeedView, RequestsView, UserProfileView };
