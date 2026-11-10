import { Util, html, Fmt, icon, TIME, Label } from './core.js';
import { DataService } from './dataService.js';
import { t } from '../i18n/index.js';
import { $, $$, catStyle, bindSubmit, UI, App } from './uiCore.js';

/* =============================================================================
   ANSICHTEN: Chats (Liste), Chat (mit angehefteter Idee & Terminvorschlag), Meine Dates
   ============================================================================= */
const ChatsView = {
  async render(el, params, ctx) {
    el.innerHTML = html`<header class="topbar"><h1>${t('tabs.chats')}</h1></header><div class="scroll"><div class="chat-list">${html`<div class="pad">${UI.skeletonList(4)}</div>`}</div></div>`;
    const box = $('.chat-list', el);
    let matches = [], sig = '';
    const meId = () => App.user && App.user.id;

    function preview(m) {
      if (m.typing) return html`<span class="conv-typing">${t('chat.typing')}</span>`;
      if (!m.last) return t('chat.newMatchHello');
      if (m.last.kind === 'message') return (m.last.senderId === meId() ? t('chat.youPrefix') : '') + m.last.text;
      return m.last.text;
    }
    function badge(m) {
      if (m.unread) return html`<span class="conv-unread" aria-label="${t('chat.unreadAria', { n: m.unread })}">${m.unread}</span>`;
      if (m.pendingProposal) return html`<span class="pill plum">${t('chat.answerNeeded')}</span>`;
      if (m.isNew) return html`<span class="pill primary">${t('chat.new')}</span>`;
      return '';
    }
    function render() {
      if (!matches.length) {
        box.innerHTML = UI.empty({ emoji: '💬', title: t('chat.noMatchesTitle'), text: t('chat.noMatchesText'),
          actions: [{ label: t('requests.discover'), go: '#/feed' }, { label: t('chat.viewRequests'), go: '#/requests', kind: 'btn-ghost' }] });
        return;
      }
      const fresh = matches.filter(m => !m.hasMessages);
      const convs = matches.filter(m => m.hasMessages || m.typing);
      box.innerHTML = html`
        ${fresh.length ? html`<div class="nm-row-title">${t('chat.newMatches')}</div><div class="new-matches">${fresh.map(m => html`
          <button type="button" class="nm-item" data-go="#/chat/${m.id}" aria-label="${t('chat.openChatAria', { name: m.other.name })}">${UI.avatar(m.other, 64, m.isNew ? 'ring' : '')}<span>${m.other.name}</span></button>`)}</div>` : ''}
        ${convs.length ? html`<div class="list-title">${t('chat.messages')}</div>${convs.map(m => html`
          <button type="button" class="conv ${m.unread || m.pendingProposal ? 'unread' : ''}" data-go="#/chat/${m.id}">
            ${UI.avatar(m.other, 54, m.isNew ? 'ring' : '')}
            <span class="conv-main">
              <span class="conv-top"><span class="conv-name">${m.other.name}</span><span class="conv-time">${Fmt.chatListTime(m.lastActivity)}</span></span>
              <span class="conv-idea">${m.idea.emoji} ${m.idea.title}${m.nextDate ? ` · 📅 ${Fmt.dateShort(m.nextDate)}` : ''}</span>
              <span class="conv-bottom"><span class="conv-preview">${preview(m)}</span>${badge(m)}</span>
            </span></button>`)}`
          : html`<div class="pad"><div class="info-note">${icon('sparkle', 18)}<span>${t('chat.tip')}</span></div></div>`}`;
    }
    async function load(silent = false) {
      try {
        const res = await DataService.getMatches();
        if (!ctx.alive) return;
        const s = JSON.stringify(res);
        if (silent && s === sig) return;
        sig = s; matches = res;
        render();
      } catch (err) {
        if (!ctx.alive) return;
        if (err.code === 'UNAUTHORIZED') return App.onUnauthorized();
        box.innerHTML = UI.errorState(err);
      }
    }
    el.addEventListener('click', e => { if (e.target.closest('[data-action="retry"]')) load(); });
    ctx.on('change', Util.debounce(() => { if (ctx.alive) load(true); }, 300));
    ctx.on('typing', d => {
      const m = matches.find(x => x.id === d.matchId);
      if (m) { m.typing = d.typing; sig = ''; render(); }
    });
    await load();
  },
};

/* ---------- Einzelner Chat ---------- */
const ChatView = {
  async render(el, params, ctx) {
    const matchId = params[0];
    App.activeChatId = matchId;
    ctx.cleanups.push(() => { if (App.activeChatId === matchId) App.activeChatId = null; });
    el.innerHTML = html`<header class="topbar chat-head bordered">
        <button type="button" class="icon-btn back" data-action="back" data-fallback="#/chats" aria-label="${t('common.back')}">${icon('back')}</button>
        <div class="who-slot" style="flex:1;min-width:0"><div class="sk-row" style="padding:0"><div class="skeleton sk-circle" style="width:40px;height:40px"></div><div class="sk-lines"><div class="skeleton sk-line" style="width:40%"></div></div></div></div>
        <div class="actions"><button type="button" class="icon-btn" data-action="propose" aria-label="${t('chat.propose')}" disabled>${icon('calendarPlus')}</button></div>
      </header>
      <div class="pinned-slot" style="flex:none;padding-top:8px"></div>
      <div class="msgs static" role="log" aria-live="polite" aria-label="${t('chat.messages')}">${UI.loading()}</div>
      <form class="composer" autocomplete="off">
        <button type="button" class="icon-btn cal" data-action="propose" aria-label="${t('chat.propose')}" disabled>${icon('calendar', 20)}</button>
        <textarea rows="1" name="text" placeholder="${t('chat.placeholder')}" aria-label="${t('chat.message')}" maxlength="1000"></textarea>
        <button type="button" class="icon-btn send" data-submit aria-label="${t('chat.send')}" disabled>${icon('send', 20)}</button>
      </form>`;
    const msgs = $('.msgs', el);
    const form = $('.composer', el);
    const ta = $('textarea', form);
    const sendBtn = $('.send', form);
    let conv = null;
    let pinnedOpen = false;

    function renderHeader() {
      const typing = conv.typing;
      $('.who-slot', el).innerHTML = html`<button type="button" class="who" data-go="#/user/${conv.other.id}">${UI.avatar(conv.other, 40)}
        <span style="min-width:0"><span class="wn">${conv.other.name}</span><span class="ws ${typing ? 'is-typing' : ''}">${typing ? t('chat.typing') : t('chat.matchSince', { when: Fmt.relative(conv.match.createdAt) })}</span></span></button>`;
    }
    function confirmedDate() {
      return conv.items.filter(x => x.kind === 'proposal' && x.status === 'confirmed' && new Date(x.dateTime).getTime() > Date.now() - 3 * 3600000)
        .sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime))[0];
    }
    function renderPinned() {
      const i = conv.idea;
      const c = confirmedDate();
      $('.pinned-slot', el).innerHTML = html`<button type="button" class="pinned ${pinnedOpen ? 'open' : ''}" data-action="toggle-pin" aria-expanded="${pinnedOpen}">
          ${UI.ideaThumb(i)}
          <span class="grow"><span class="pk">${icon('pin', 12)} ${t('match.plannedDate')}</span><span class="pt">${i.title}</span>
            <span class="ps">${i.location} · ${i.budget} · ${Label.time(i.timeOfDay)}</span>
            ${c ? html`<span class="date-confirmed">${icon('check', 13, 2.6)} ${t('chat.confirmedOn', { when: Fmt.dateShort(c.dateTime) })}</span>` : ''}</span>
          <span class="chev">${icon('chevronDown', 18)}</span></button>
        ${pinnedOpen ? html`<div class="pinned-detail">${i.description}${UI.metaChips(i)}</div>` : ''}`;
    }
    function proposalCard(p, fresh) {
      const mine = p.proposedBy === conv.me.id;
      const past = new Date(p.dateTime).getTime() < Date.now();
      let foot;
      if (p.status === 'proposed') {
        if (mine) foot = html`<div class="pr-status"><span class="pill gray">${icon('clock', 13)} ${t('chat.waitingFor', { name: conv.other.name })}</span></div>`;
        else if (past) foot = html`<div class="pr-status"><span class="pill gray">${t('chat.expired')}</span></div>`;
        else foot = html`<div class="pr-actions"><button type="button" class="btn btn-secondary btn-sm" data-action="prop-decline" data-pid="${p.id}">${t('chat.notGood')}</button>
          <button type="button" class="btn btn-primary btn-sm" data-action="prop-confirm" data-pid="${p.id}">${icon('check', 16)} ${t('chat.confirm')}</button></div>`;
      } else if (p.status === 'confirmed') foot = html`<div class="pr-status"><span class="pill green">${icon('check', 13, 2.6)} ${t('chat.confirmedInDates')}</span></div>`;
      else foot = html`<div class="pr-status"><span class="pill danger">${t('chat.declined')}</span></div>`;
      return html`<div class="proposal ${fresh ? 'fresh' : ''}" data-pid="${p.id}">
        <div class="pr-top">${icon('calendar', 15)} ${mine ? t('chat.proposalByYou') : t('chat.proposalBy', { name: conv.other.name })}</div>
        <div class="pr-body"><div class="pr-cal"><div class="m">${Fmt.monthShort(p.dateTime)}</div><div class="d">${Fmt.dayNum(p.dateTime)}</div></div>
          <div style="min-width:0"><div class="pr-when">${t('chat.whenAt', { weekday: Fmt.weekdayLong(p.dateTime), time: Fmt.time(p.dateTime) })}</div>
          <div class="pr-sub">${conv.idea.emoji} ${conv.idea.title}</div></div></div>${foot}</div>`;
    }
    /** Rendert den Verlauf; nur das neue Element (freshId) wird animiert. */
    function renderItems(freshId = null) {
      const atBottom = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 120;
      const items = conv.items;
      const lastMine = [...items].reverse().find(x => x.kind === 'message' && x.senderId === conv.me.id);
      const out = [];
      let lastDay = null, prevMsg = null;
      if (!items.length) {
        out.push(html`<div class="empty" style="padding:24px 18px"><div class="em" style="width:72px;height:72px;font-size:34px">👋</div>
          <h3>${t('chat.sayHello', { name: conv.other.name })}</h3><p>${t('chat.sayHelloText')}</p></div>`);
      }
      items.forEach((it, idx) => {
        const day = new Date(it.createdAt).toDateString();
        if (day !== lastDay) { out.push(html`<div class="day-sep">${Fmt.dayLabel(it.createdAt)}</div>`); lastDay = day; prevMsg = null; }
        if (it.kind === 'proposal') { out.push(proposalCard(it, it.id === freshId)); prevMsg = null; return; }
        const mine = it.senderId === conv.me.id;
        const next = items[idx + 1];
        const gap = !prevMsg || prevMsg.senderId !== it.senderId || it.createdAt - prevMsg.createdAt > 10 * 60000;
        const showMeta = !next || next.kind !== 'message' || next.senderId !== it.senderId || next.createdAt - it.createdAt > 10 * 60000 || new Date(next.createdAt).toDateString() !== day;
        let meta = '';
        if (it.failed) meta = t('chat.notSent');
        else if (it.pending) meta = t('chat.sending');
        else if (showMeta) meta = Fmt.time(it.createdAt) + (mine && lastMine && it.id === lastMine.id && it.read ? ' · ' + t('chat.read') : '');
        out.push(html`<div class="msg ${mine ? 'me' : 'them'} ${gap ? 'gap' : ''} ${it.fromLike ? 'first-like' : ''} ${it.pending ? 'pending' : ''} ${it.failed ? 'failed' : ''} ${it.id === freshId ? 'fresh' : ''}" data-mid="${it.id}">
          <div class="bubble">${it.text}</div>${meta ? html`<div class="msg-meta">${meta}</div>` : ''}</div>`);
        prevMsg = it;
      });
      if (conv.typing) out.push(html`<div class="typing fresh" aria-label="${t('chat.typingAria', { name: conv.other.name })}"><i></i><i></i><i></i></div>`);
      msgs.innerHTML = html`${out}`;
      if (atBottom || freshId) msgs.scrollTop = msgs.scrollHeight;
    }
    async function load() {
      try {
        conv = await DataService.getMessages(matchId);
        if (!ctx.alive) return;
        renderHeader(); renderPinned(); renderItems();
        msgs.scrollTop = msgs.scrollHeight;
        $$('[data-action="propose"]', el).forEach(b => { b.disabled = false; });
        DataService.markAsRead(matchId).then(() => App.refreshBadges()).catch(() => {});
      } catch (err) {
        if (!ctx.alive) return;
        if (err.code === 'UNAUTHORIZED') return App.onUnauthorized();
        msgs.innerHTML = UI.errorState(err);
      }
    }

    /** Stilles Neuladen (z. B. bei Änderungen aus einem anderen Tab) – ohne Seitenwechsel-Animation. */
    ctx.reload = async () => {
      if (!conv) return load();
      try {
        const fresh = await DataService.getMessages(matchId);
        if (!ctx.alive) return;
        const key = items => items.map(x => `${x.id}:${x.status || ''}:${x.read ? 1 : 0}`).join('|');
        const pendingTmp = conv.items.filter(x => x.pending || x.failed);
        if (key(fresh.items) === key(conv.items.filter(x => !x.pending && !x.failed))) return;
        const last = fresh.items[fresh.items.length - 1];
        const isNew = last && !conv.items.some(x => x.id === last.id);
        conv = { ...fresh, typing: conv.typing, items: [...fresh.items, ...pendingTmp] };
        renderHeader(); renderPinned(); renderItems(isNew ? last.id : null);
        if (isNew) DataService.markAsRead(matchId).catch(() => {});
      } catch (err) { /* still – beim nächsten Ereignis erneut */ }
    };

    /* ---- Nachricht senden (optimistisch) ---- */
    const autoGrow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; };
    ta.addEventListener('input', () => {
      autoGrow();
      sendBtn.disabled = !ta.value.trim() || !conv;
      if (conv && ta.value.trim()) DataService.sendTyping(conv.match.id);
    });
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
    bindSubmit(form, send);
    async function send() {
      const text = ta.value.trim();
      if (!text || !conv) return;
      ta.value = ''; autoGrow(); sendBtn.disabled = true;
      const tempId = 'tmp_' + Date.now();
      conv.items.push({ kind: 'message', id: tempId, senderId: conv.me.id, text, createdAt: Date.now(), read: false, pending: true });
      renderItems(tempId);
      try {
        const msg = await DataService.sendMessage(matchId, text);
        if (!ctx.alive) return;
        const i = conv.items.findIndex(x => x.id === tempId);
        if (i >= 0) conv.items[i] = { kind: 'message', ...msg };
        else if (!conv.items.some(x => x.id === msg.id)) conv.items.push({ kind: 'message', ...msg });
        conv.items.sort((a, b) => a.createdAt - b.createdAt);
        renderItems();
      } catch (err) {
        const it = conv.items.find(x => x.id === tempId);
        if (it) { it.pending = false; it.failed = true; }
        if (ctx.alive) renderItems();
        UI.handleError(err);
      }
    }

    /* ---- Terminvorschlag ---- */
    function openProposal() {
      const def = (TIME[conv.idea.timeOfDay] || TIME.Abends).defaultHour;
      const quick = [];
      const add = (offset, label) => { const d = new Date(); d.setDate(d.getDate() + offset); const iso = Util.isoDate(d); if (!quick.some(q => q.iso === iso)) quick.push({ label, iso }); };
      const today = new Date();
      const [dh, dm] = def.split(':').map(Number);
      if (today.getHours() * 60 + today.getMinutes() < dh * 60 + dm - 60) add(0, t('fmt.today'));
      add(1, t('chat.tomorrow'));
      const toSat = (6 - today.getDay() + 7) % 7 || 7, toSun = (7 - today.getDay()) % 7 || 7;
      add(toSat, t('chat.saturday'));
      add(toSun, t('chat.sunday'));
      add(7, t('chat.inAWeek'));
      const st = { date: quick[0].iso, time: def };
      const maxD = new Date(); maxD.setFullYear(maxD.getFullYear() + 1);
      const summary = () => {
        const d = new Date(`${st.date}T${st.time || '00:00'}:00`);
        return isNaN(d) ? t('validation.proposal.missing') : Fmt.dateTimeLong(d.toISOString());
      };
      UI.sheet({
        title: t('chat.propose'), subtitle: `${conv.idea.emoji} ${conv.idea.title}`,
        body: html`<div class="field"><span class="label">${t('chat.quickPick')}</span><div class="chips">${quick.map((q, i) => html`<button type="button" class="chip ${i === 0 ? 'is-on' : ''}" data-day="${q.iso}">${q.label}</button>`)}</div></div>
          <div class="dt-row">
            <div class="field" data-field="dateTime"><label class="label" for="pr-date">${t('chat.date')}</label><input id="pr-date" class="input" type="date" min="${Util.isoDate(new Date())}" max="${Util.isoDate(maxD)}" value="${st.date}"></div>
            <div class="field" style="max-width:130px"><label class="label" for="pr-time">${t('chat.time')}</label><input id="pr-time" class="input" type="time" step="900" value="${st.time}"></div>
          </div>
          <div class="prop-preview">${icon('calendar', 18)}<span class="sum">${summary()}</span></div>
          <p class="hint" style="margin-top:10px">${t('chat.proposeHint', { name: conv.other.name })}</p>`,
        foot: html`<button type="button" class="btn btn-secondary" data-close>${t('common.cancel')}</button><button type="button" class="btn btn-primary" style="flex:1" data-send>${icon('send', 17)} ${t('chat.sendProposal')}</button>`,
        onMount(sheet, close) {
          const di = $('#pr-date', sheet), tiI = $('#pr-time', sheet), sum = $('.sum', sheet);
          const upd = () => { sum.textContent = summary(); UI.clearErrors(sheet); };
          di.addEventListener('input', () => { st.date = di.value; $$('[data-day]', sheet).forEach(c => c.classList.toggle('is-on', c.dataset.day === st.date)); upd(); });
          tiI.addEventListener('input', () => { st.time = tiI.value; upd(); });
          sheet.addEventListener('click', async e => {
            const c = e.target.closest('[data-day]');
            if (c) { st.date = c.dataset.day; di.value = st.date; $$('[data-day]', sheet).forEach(x => x.classList.toggle('is-on', x === c)); upd(); }
            const sendB = e.target.closest('[data-send]');
            if (!sendB || UI.isBusy(sendB)) return;
            const d = new Date(`${st.date}T${st.time || ''}:00`);
            if (!st.date || !st.time || isNaN(d)) return UI.fieldErrors(sheet, { dateTime: t('validation.proposal.missing') });
            UI.busy(sendB, true);
            try {
              const p = await DataService.proposeDate(matchId, d.toISOString());
              close();
              if (!ctx.alive) return;
              conv.items.push({ kind: 'proposal', ...p });
              renderItems(p.id);
            } catch (err) { UI.busy(sendB, false); UI.handleError(err, $('.sheet-body', sheet)); }
          });
        },
      });
    }

    el.addEventListener('click', async e => {
      const btn = e.target.closest('[data-action]');
      if (!btn || !conv) { if (btn && btn.dataset.action === 'retry') load(); return; }
      switch (btn.dataset.action) {
        case 'toggle-pin': pinnedOpen = !pinnedOpen; renderPinned(); break;
        case 'propose': openProposal(); break;
        case 'retry': load(); break;
        case 'prop-confirm':
        case 'prop-decline': {
          if (UI.isBusy(btn)) return;
          UI.busy(btn, true);
          try {
            const accept = btn.dataset.action === 'prop-confirm';
            const p = await DataService.respondToProposal(btn.dataset.pid, accept);
            const i = conv.items.findIndex(x => x.id === p.id);
            if (i >= 0) conv.items[i] = { kind: 'proposal', ...p };
            renderItems(); renderPinned();
            if (accept) UI.toast({ icon: '🎉', title: t('chat.dateConfirmed'), text: Fmt.dateTimeLong(p.dateTime), light: true });
          } catch (err) { UI.busy(btn, false); UI.handleError(err); }
          break;
        }
      }
    });

    /* ---- Echtzeit-Ereignisse (später WebSocket) ---- */
    ctx.on('message', d => {
      if (d.matchId !== matchId || !conv) return;
      if (!conv.items.some(x => x.id === d.message.id)) conv.items.push({ kind: 'message', ...d.message });
      conv.typing = false;
      renderHeader(); renderItems(d.message.id);
      DataService.markAsRead(matchId).catch(() => {});
    });
    ctx.on('typing', d => {
      if (d.matchId !== matchId || !conv || d.userId !== conv.other.id) return;
      conv.typing = d.typing;
      renderHeader(); renderItems();
    });
    ctx.on('read', d => {
      if (d.matchId !== matchId || !conv) return;
      conv.items.forEach(x => { if (x.kind === 'message' && x.senderId === conv.me.id) x.read = true; });
      renderItems();
    });
    ctx.on('proposal', d => {
      if (d.matchId !== matchId || !conv) return;
      const i = conv.items.findIndex(x => x.id === d.proposal.id);
      if (i >= 0) conv.items[i] = { kind: 'proposal', ...d.proposal }; else conv.items.push({ kind: 'proposal', ...d.proposal });
      renderItems(d.proposal.id); renderPinned();
      if (d.proposal.status === 'confirmed') UI.toast({ icon: '🎉', title: t('app.proposalConfirmed', { name: conv.other.name }), text: Fmt.dateTimeLong(d.proposal.dateTime), light: true });
    });
    await load();
  },
  onSync(ctx) { if (ctx.alive && ctx.reload) ctx.reload(); },
};

/* ---------- Meine Dates ---------- */
const DatesView = {
  async render(el, params, ctx) {
    el.innerHTML = html`<header class="topbar"><h1>${t('dates.title')}</h1></header><div class="scroll"><div class="pad list">${UI.skeletonList(3)}</div></div>`;
    const list = $('.list', el);
    let sig = '';
    function card(x, kind) {
      const p = x.proposal;
      let status;
      if (kind === 'upcoming') status = html`<span class="countdown">${Fmt.countdown(p.dateTime)}</span>`;
      else if (kind === 'pending') status = x.mine ? html`<span class="pill gray" style="margin-left:auto">${t('dates.waitingFor', { name: x.other.name })}</span>` : html`<span class="pill plum" style="margin-left:auto">${t('dates.waitingForYou')}</span>`;
      else status = html`<span class="pill gray" style="margin-left:auto">${t('dates.over')}</span>`;
      return html`<button type="button" class="date-card ${kind === 'past' ? 'past' : ''}" data-go="#/chat/${x.matchId}">
        <span class="date-block" style="${catStyle(x.idea.category)}"><span class="wd">${Fmt.weekdayShort(p.dateTime)}</span><span class="dd">${Fmt.dayNum(p.dateTime)}</span><span class="mm">${Fmt.monthShort(p.dateTime)}</span></span>
        <span class="date-info"><span class="t">${x.idea.emoji} ${x.idea.title}</span>
          <span class="row">${icon('clock', 15)}<span>${t('fmt.clock', { time: Fmt.time(p.dateTime) })}</span>${status}</span>
          <span class="row">${icon('pin', 15)}<span>${x.idea.location}</span></span>
          <span class="row">${UI.avatar(x.other, 22)}<span>${t('dates.with', { name: x.other.name, age: x.other.age })}</span></span></span></button>`;
    }
    async function load(silent = false) {
      try {
        const d = await DataService.getMyDates();
        if (!ctx.alive) return;
        const s = JSON.stringify(d);
        if (silent && s === sig) return;
        sig = s;
        if (!d.upcoming.length && !d.pending.length && !d.past.length) {
          list.innerHTML = UI.empty({ emoji: '🗓️', title: t('dates.noneTitle'), text: t('dates.noneText'),
            actions: [{ label: t('dates.toChats'), go: '#/chats' }] });
          return;
        }
        list.innerHTML = html`
          ${d.upcoming.length ? html`<div class="section-title" style="margin-top:4px">${t('dates.upcoming')}</div>${d.upcoming.map(x => card(x, 'upcoming'))}` : html`<div class="info-note">${icon('info', 18)}<span>${t('dates.planning')}</span></div>`}
          ${d.pending.length ? html`<div class="section-title">${t('dates.pending')}</div>${d.pending.map(x => card(x, 'pending'))}` : ''}
          ${d.past.length ? html`<div class="section-title">${t('dates.past')}</div>${d.past.map(x => card(x, 'past'))}` : ''}`;
      } catch (err) {
        if (!ctx.alive) return;
        if (err.code === 'UNAUTHORIZED') return App.onUnauthorized();
        list.innerHTML = UI.errorState(err);
      }
    }
    el.addEventListener('click', e => { if (e.target.closest('[data-action="retry"]')) load(); });
    ctx.on('change', Util.debounce(() => { if (ctx.alive) load(true); }, 400));
    await load();
  },
};

export { ChatsView, ChatView, DatesView };
