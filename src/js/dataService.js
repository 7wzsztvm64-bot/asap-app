import { Util, Fmt, CAT, BUDGETS, TIME, DURATIONS, GENDER, PLACES, INTEREST_TAGS, hashPassword, SafeStorage, ApiError } from './core.js';
import { TEST_ACCOUNTS, buildSeedDB } from './seed.js';

/* =============================================================================
   4) DATASERVICE – die EINZIGE Schicht mit Datenzugriff
   -----------------------------------------------------------------------------
   Die UI ruft ausschließlich diese async-Methoden auf und greift nie direkt auf
   localStorage zu. Aktuell ist dahinter ein Mock-Backend auf Basis von
   localStorage (inkl. simulierter Netzwerklatenz von 200–600 ms).
   Für ein echtes Backend werden nur die Methodenrümpfe durch fetch()-Aufrufe
   ersetzt – die mit „BACKEND:“ markierten Kommentare nennen den Endpunkt.
   Die Simulation der Testaccounts (Bot-Engine) entspricht konzeptionell der
   Server-Seite bzw. echten Menschen und entfällt mit einem echten Backend.

   Beispiel, wie eine Methode später aussieht (Signatur & Rückgabe bleiben gleich):

     const API_BASE = 'https://api.dabei.app/v1';
     async function apiFetch(path, options = {}) {
       const res = await fetch(API_BASE + path, {
         credentials: 'include',                       // Session-Cookie (HttpOnly)
         headers: { 'Content-Type': 'application/json' },
         ...options,
       });
       const body = await res.json().catch(() => ({}));
       if (!res.ok) { const e = new ApiError(body.message || 'Serverfehler', body.code || res.status); e.fields = body.fields; throw e; }
       return body;
     }
     getFeed(filters) {
       const qs = new URLSearchParams({ categories: filters.categories.join(','), budgets: filters.budgets.join(','),
         times: filters.times.join(','), maxDistance: filters.maxDistance || '' });
       return apiFetch('/feed?' + qs);
     },
     likeIdea(ideaId, message) {
       return apiFetch(`/ideas/${ideaId}/likes`, { method: 'POST', body: JSON.stringify({ message }) });
     },

   Echtzeit-Ereignisse (match, message, typing, request, proposal) würden dann über
   einen WebSocket an dieselben DataService.on(...)-Listener weitergereicht.
   ============================================================================= */
const DataService = (() => {
  const KEY_DB = 'asap.db.v1';
  const KEY_SESSION = 'asap.session.v1';
  const KEY_SETTINGS = 'asap.settings.v1';
  const LATENCY_MS = [200, 600];
  const MIN = 60000, HOUR = 3600000, DAY = 86400000;

  const listeners = new Map();
  const typing = {};          // matchId -> userId (flüchtiger Zustand „schreibt …“)
  let pending = 0;            // laufende simulierte Requests
  let ready = null;           // Init-Promise
  let tickTimer = null;

  /* ---------- Event-Bus ----------
     BACKEND: Echtzeit-Ereignisse kämen später per WebSocket/SSE oder Push,
     z. B. wss://api.dabei.app/v1/realtime (match, message, typing, request, proposal). */
  function on(type, fn) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
    return () => listeners.get(type) && listeners.get(type).delete(fn);
  }
  function emit(type, detail = {}) {
    const set = listeners.get(type);
    if (!set) return;
    [...set].forEach(fn => { try { fn(detail); } catch (e) { console.error('[DataService] Listener-Fehler:', e); } });
  }

  /* ---------- Persistenz (Mock-Datenbank) ---------- */
  function loadDB() {
    const rawDb = SafeStorage.local.get(KEY_DB);
    if (!rawDb) return null;
    try { return JSON.parse(rawDb); } catch (e) { return null; }
  }
  function saveDB(db) { SafeStorage.local.set(KEY_DB, JSON.stringify(db)); }
  function read(fn) {
    const db = loadDB();
    if (!db) throw new ApiError('Die Datenbank ist nicht verfügbar. Bitte lade die Seite neu.', 'NO_DB');
    return fn(db);
  }
  /** Read-Modify-Write: frisch laden, ändern, speichern (robust auch bei mehreren Tabs). */
  function write(fn) {
    const db = loadDB();
    if (!db) throw new ApiError('Die Datenbank ist nicht verfügbar. Bitte lade die Seite neu.', 'NO_DB');
    const result = fn(db);
    saveDB(db);
    return result;
  }
  function settings() {
    try { return { autoReplies: true, ...JSON.parse(SafeStorage.local.get(KEY_SETTINGS) || '{}') }; }
    catch (e) { return { autoReplies: true }; }
  }
  function saveSettings(s) { SafeStorage.local.set(KEY_SETTINGS, JSON.stringify(s)); }

  /* ---------- Netzwerk-Simulation ---------- */
  async function request(label, fn) {
    pending++;
    emit('network', { pending, label });
    try {
      await Util.sleep(Util.randInt(LATENCY_MS[0], LATENCY_MS[1]));
      await ready;
      return await fn();
    } finally {
      pending--;
      emit('network', { pending, label });
    }
  }
  function changed(source) { emit('change', { source }); }

  /* ---------- Session ----------
     BACKEND: Token käme vom Server (z. B. HttpOnly-Cookie oder JWT) – hier simuliert. */
  function readSession() {
    for (const store of [SafeStorage.session, SafeStorage.local]) {
      const s = store.get(KEY_SESSION);
      if (s) { try { const parsed = JSON.parse(s); if (parsed && parsed.token) return parsed; } catch (e) { /* ignorieren */ } }
    }
    return null;
  }
  function writeSession(session, remember) {
    const v = JSON.stringify(session);
    if (remember) { SafeStorage.local.set(KEY_SESSION, v); SafeStorage.session.remove(KEY_SESSION); }
    else { SafeStorage.session.set(KEY_SESSION, v); }
  }
  function clearSessionStorage() {
    const current = readSession();
    SafeStorage.session.remove(KEY_SESSION);
    const ls = SafeStorage.local.get(KEY_SESSION);
    if (!ls) return;
    try {
      const p = JSON.parse(ls);
      if (!current || p.token === current.token || p.userId === current.userId) SafeStorage.local.remove(KEY_SESSION);
    } catch (e) { SafeStorage.local.remove(KEY_SESSION); }
  }
  function createSession(db, userId, remember) {
    const token = Util.uid('tok') + Math.random().toString(36).slice(2, 10);
    db.sessions = (db.sessions || []).filter(s => Date.now() - s.createdAt < 30 * DAY);
    db.sessions.push({ token, userId, createdAt: Date.now(), remember: !!remember });
    writeSession({ token, userId }, remember);
    return token;
  }
  function sessionUserId(db) {
    const s = readSession();
    if (!s) return null;
    const valid = (db.sessions || []).some(x => x.token === s.token && x.userId === s.userId);
    return valid && db.users.some(u => u.id === s.userId) ? s.userId : null;
  }
  function requireMe(db) {
    const id = sessionUserId(db);
    if (!id) throw new ApiError('Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.', 'UNAUTHORIZED');
    return db.users.find(u => u.id === id);
  }

  /* ---------- Mapper: nie Passwort-Hash oder E-Mail fremder Personen herausgeben ---------- */
  function coordsFor(city) {
    if (!city) return null;
    const c = city.trim().toLowerCase();
    const keys = Object.keys(PLACES);
    const key = keys.find(k => k.toLowerCase() === c) || keys.find(k => c.length >= 3 && k.toLowerCase().includes(c));
    return key ? PLACES[key] : null;
  }
  function haversine([lat1, lon1], [lat2, lon2]) {
    const R = 6371, rad = x => x * Math.PI / 180;
    const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }
  /** Simulierte Entfernung: Stadtteil-Koordinaten + stabiler Zufallsanteil („genaue Adresse“). */
  function distanceKm(a, b) {
    const jitter = (Util.hash([a.id, b.id].sort().join('|')) % 1000) / 1000;
    const ca = coordsFor(a.city), cb = coordsFor(b.city);
    const d = (ca && cb) ? haversine(ca, cb) + 0.6 + jitter * 1.8 : 3 + jitter * 30;
    return Math.round(d * 10) / 10;
  }
  function compatible(a, b) {
    return (a.interestedIn || []).includes(b.gender) && (b.interestedIn || []).includes(a.gender);
  }
  function publicUser(u, viewer) {
    if (!u) return null;
    const isOther = viewer && viewer.id !== u.id;
    return {
      id: u.id, name: u.name, age: Util.ageFrom(u.birthdate), gender: u.gender, city: u.city, bio: u.bio || '',
      photos: u.photos || [], interests: u.interests || [],
      distanceKm: isOther ? distanceKm(viewer, u) : null,
      sharedInterests: isOther ? (u.interests || []).filter(t => (viewer.interests || []).includes(t)) : [],
    };
  }
  function privateUser(u, db) {
    const { passwordHash, ...rest } = u;
    const ideas = db.ideas.filter(i => i.ownerId === u.id && !i.deletedAt);
    return { ...rest, age: Util.ageFrom(u.birthdate), ideasCount: ideas.length, activeIdeasCount: ideas.filter(i => i.active).length };
  }
  function publicIdea(i) { return i ? { ...i } : null; }
  function matchBetween(db, a, b) { return db.matches.find(m => m.userIds.includes(a) && m.userIds.includes(b)); }
  function otherIdOf(match, me) { return match.userIds.find(id => id !== me); }
  function userById(db, id) { return db.users.find(u => u.id === id); }
  function validationError(fields, message = 'Bitte prüfe die markierten Felder.') {
    const e = new ApiError(message, 'VALIDATION');
    e.fields = fields;
    return e;
  }

  /** Match aus einem angenommenen Like erzeugen (bzw. bestehendes Match wiederverwenden). */
  function createMatch(db, like, acceptorId) {
    const existing = matchBetween(db, like.fromUserId, like.toUserId);
    if (existing) { like.mergedIntoMatchId = existing.id; return existing; }
    const match = { id: Util.uid('match'), userIds: [like.toUserId, like.fromUserId], ideaId: like.ideaId, likeId: like.id, createdAt: Date.now(), seenBy: [acceptorId] };
    db.matches.push(match);
    if (like.message) {
      // Wie bei Hinge: Die Nachricht zum Like eröffnet den Chat.
      db.messages.push({ id: Util.uid('msg'), matchId: match.id, senderId: like.fromUserId, text: like.message, createdAt: like.createdAt, read: true, fromLike: true });
    }
    // Weitere offene Likes zwischen den beiden laufen in dieses Match.
    db.likes.forEach(l => {
      const samePair = (l.fromUserId === like.fromUserId && l.toUserId === like.toUserId) || (l.fromUserId === like.toUserId && l.toUserId === like.fromUserId);
      if (l.id !== like.id && l.status === 'pending' && samePair) { l.status = 'accepted'; l.respondedAt = Date.now(); l.mergedIntoMatchId = match.id; }
    });
    return match;
  }
  function matchPayload(db, match, meId) {
    const me = userById(db, meId);
    return {
      matchId: match.id,
      me: publicUser(me),
      other: publicUser(userById(db, otherIdOf(match, meId)), me),
      idea: publicIdea(db.ideas.find(i => i.id === match.ideaId)),
    };
  }
  function proposalPreview(p, meId, otherName) {
    const when = Fmt.dateShort(p.dateTime);
    if (p.status === 'confirmed') return `📅 Date bestätigt: ${when}`;
    if (p.status === 'declined') return '📅 Terminvorschlag abgelehnt';
    return p.proposedBy === meId ? `📅 Du hast ${when} vorgeschlagen` : `📅 ${otherName} schlägt ${when} vor`;
  }

  /* ===========================================================================
     SIMULATION DER TESTACCOUNTS („Bot-Engine“)
     Geplante Reaktionen liegen in db.botQueue und überleben so auch ein Neuladen.
     =========================================================================== */
  const BOT = {
    likeMessages: ['Das klingt nach einem richtig guten Plan! 😊', 'Da wollte ich schon ewig mal hin!',
      'Endlich mal eine Idee, die nicht nur „was trinken gehen“ ist 🙌', 'Ich bin dabei – wenn du mir die besten Ecken zeigst 😄',
      'Klingt perfekt für einen entspannten Tag!', 'Okay, du hattest mich schon beim Titel 😄', null, null, null],
    opener: ['Hey {me}! Schön, dass du bei „{idea}“ dabei bist 😊', 'Hi {me}! Ich freu mich schon. Kennst du {location} eigentlich?',
      'Hallo {me} 👋 Wie schön, dass es gematcht hat! Wann hättest du denn Zeit?', 'Hey {me}! Ich hab gehofft, dass jemand Lust auf genau das hat 😄'],
    replies: {
      greeting: ['Hey {me}! 😊 Schön, von dir zu lesen.', 'Hi {me}! Freut mich, dass es gematcht hat 🙌', 'Hallo {me}! Na, wie läuft dein Tag so?', 'Hey! Ich hab mich echt über das Match gefreut 😊'],
      howareyou: ['Mir geht\'s super, danke! Gerade erst heimgekommen. Und dir?', 'Ganz gut! Etwas müde, aber deine Nachricht hilft 😄 Und bei dir?', 'Bestens – das Wetter könnte besser sein, aber die Laune stimmt. Und du?'],
      time: ['Unter der Woche klappt es bei mir meistens ab 18 Uhr. Schlag doch einfach einen Termin vor 📅',
        'Am Wochenende bin ich ziemlich flexibel! Magst du über den Kalender-Button einen Termin vorschlagen?',
        'Diese Woche ist etwas voll, aber nächste Woche geht fast immer. Schick mir gern einen Vorschlag 🙂',
        'Klingt gut! Schick mir einfach einen konkreten Termin, dann trag ich ihn mir direkt ein.'],
      job: ['Kurz gesagt: {bio1} 😄 Und du so?', 'Steht ein bisschen in meinem Profil: {bio1} Was machst du so?'],
      question: ['Gute Frage! 🤔 Ich würde sagen: spontan entscheiden.', 'Hmm, ehrlich gesagt – beides! 😄', 'Lass uns das beim Date klären, dann haben wir direkt ein Gesprächsthema 😉',
        'Oh, da muss ich kurz überlegen … ich sag ja!', 'Ich glaube schon! Frag mich das nochmal, wenn wir uns sehen 😄'],
      positive: ['Haha, das gefällt mir 😂', 'Klingt gut! 😊', 'Oh ja, auf jeden Fall!', 'Du bist lustig 😄', 'Sehr gut, dann sind wir uns ja einig 🙌'],
      thanks: ['Gerne! 😊', 'Immer doch!', 'Kein Ding 😄'],
      idea: ['Ich freu mich schon richtig auf „{idea}“ ✨', 'Warst du schon mal bei {location}?', 'Bei „{idea}“ kann eigentlich nichts schiefgehen, oder? 😄'],
      generic: ['Erzähl mehr! 😊', 'Haha, wie cool. Was machst du sonst so am Wochenende?', 'Das klingt spannend! Wie bist du darauf gekommen?', 'Okay, jetzt bin ich neugierig 😄',
        'Ich mag, wie du schreibst 🙂', 'Stimmt! Und was ist eigentlich dein Lieblingsort in Frankfurt?', 'Ha, das hätte ich jetzt nicht erwartet 😄', 'Sehr sympathisch. Ich freu mich auf unser Date!'],
      followUp: ['Übrigens: Ich freu mich schon auf „{idea}“ 😊', 'Ach, und: Hast du eigentlich schon Pläne fürs Wochenende?', 'Sag mal, warst du schon mal bei {location}?'],
    },
    confirm: ['Perfekt, {when} passt mir super! 🙌', 'Abgemacht – {when}! Ich freu mich 😊', 'Ist eingetragen! Dann bis {when} 🗓️'],
    decline: ['Oh, {when} kann ich leider nicht 😕 Hast du noch einen anderen Termin?', 'Mist, da bin ich schon verplant. Wie wär\'s ein paar Tage später?'],
  };
  function fill(tpl, vars) { return tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : '')); }
  function pickTemplate(db, matchId, pool) {
    db.botMemory = db.botMemory || {};
    const mem = db.botMemory[matchId] || (db.botMemory[matchId] = []);
    let candidates = pool.filter(t => !mem.includes(t));
    if (!candidates.length) candidates = pool;
    const t = Util.pick(candidates);
    mem.push(t);
    if (mem.length > 18) mem.shift();
    return t;
  }
  function detectIntent(text, botHasWritten, idea) {
    const t = text.toLowerCase().trim();
    if (/(^|\s)(danke|dankeschön|merci|thx)/.test(t)) return 'thanks';
    if (/wie geht'?s|wie geht es|wie läuft/.test(t)) return 'howareyou';
    if (/(wann|termin|zeit hast|hast du zeit|wochenende|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|morgen|heute abend|nächste woche|\d{1,2}(:\d{2})? ?uhr)/.test(t)) return 'time';
    if (!botHasWritten && /^(hi|hey|hallo|moin|servus|huhu|hej|hello|na|guten (morgen|tag|abend))\b/.test(t)) return 'greeting';
    if (/(beruflich|arbeitest|dein job|studierst|was machst du so)/.test(t)) return 'job';
    if (idea) {
      const words = (idea.title + ' ' + idea.location).toLowerCase().split(/[^a-zäöüß]+/).filter(w => w.length >= 5);
      if (words.some(w => t.includes(w))) return 'idea';
    }
    if (t.includes('?')) return 'question';
    if (/(haha|hihi|lol|😂|😄|😅|🤣|cool|super|toll|geil|nice|klasse|perfekt|gerne|gern|freu)/.test(t)) return 'positive';
    return 'generic';
  }
  function botVars(db, match, botId) {
    const bot = userById(db, botId);
    const other = userById(db, otherIdOf(match, botId));
    const idea = db.ideas.find(i => i.id === match.ideaId);
    const bio1 = ((bot && bot.bio) || '').split(/(?<=[.!?])\s/)[0] || '';
    return { bot, other, idea, vars: { me: other ? other.name : '', idea: idea ? idea.title : 'unser Date', location: idea ? idea.location : 'dem Treffpunkt', bio1 } };
  }
  function enqueue(db, job, delayMs) {
    db.botQueue = db.botQueue || [];
    db.botQueue.push({ id: Util.uid('job'), dueAt: Date.now() + delayMs, ...job });
  }
  /** „schreibt …“ anzeigen und danach die Nachricht senden. */
  function scheduleBotMessage(db, matchId, botId, kind, startDelay, extra = {}) {
    const typingMs = Util.randInt(1500, 3200);
    enqueue(db, { type: 'botTyping', matchId, botId }, startDelay);
    enqueue(db, { type: 'botSay', matchId, botId, kind, ...extra }, startDelay + typingMs);
  }
  function seedBotLikesForNewUser(db, user) {
    // „Einige Testaccounts haben bereits Ideen des Nutzers gelikt“ – sofort 2 Anfragen …
    for (let i = 0; i < 2; i++) runJob(db, { type: 'botLikeUserIdea', userId: user.id, silent: true }, []);
    // … und später (bei aktiven Auto-Antworten) noch ein paar weitere.
    enqueue(db, { type: 'botLikeUserIdea', userId: user.id }, Util.randInt(40000, 70000));
    enqueue(db, { type: 'botLikeUserIdea', userId: user.id }, Util.randInt(110000, 170000));
    user.botLikesSeeded = true;
  }

  function runJob(db, job, events) {
    const meId = sessionUserId(db);
    switch (job.type) {
      case 'botRespondLike': {
        const like = db.likes.find(l => l.id === job.likeId);
        if (!like || like.status !== 'pending') return;
        like.respondedAt = Date.now();
        if (job.accept) {
          like.status = 'accepted';
          const match = createMatch(db, like, like.toUserId);
          if (like.fromUserId === meId) events.push(['match', matchPayload(db, match, meId)]);
          if (Math.random() < 0.65) enqueue(db, { type: 'botOpener', matchId: match.id, botId: like.toUserId }, Util.randInt(9000, 22000));
        } else {
          like.status = 'declined'; // Die liked Person erfährt davon nichts.
        }
        return;
      }
      case 'botOpener': {
        const match = db.matches.find(m => m.id === job.matchId);
        if (!match || db.messages.some(m => m.matchId === match.id && m.senderId === job.botId)) return;
        scheduleBotMessage(db, match.id, job.botId, 'opener', 0);
        return;
      }
      case 'botRead': {
        db.messages.forEach(m => { if (m.matchId === job.matchId && m.senderId !== job.botId) m.read = true; });
        events.push(['read', { matchId: job.matchId }]);
        return;
      }
      case 'botTyping': {
        typing[job.matchId] = job.botId;
        events.push(['typing', { matchId: job.matchId, userId: job.botId, typing: true }]);
        return;
      }
      case 'botSay': {
        const match = db.matches.find(m => m.id === job.matchId);
        if (!match) return;
        const { bot, idea, vars } = botVars(db, match, job.botId);
        let text = job.text;
        if (!text) {
          if (job.kind === 'opener') text = fill(pickTemplate(db, match.id, BOT.opener), vars);
          else if (job.kind === 'followUp') text = fill(pickTemplate(db, match.id, BOT.replies.followUp), vars);
          else if (job.kind === 'confirm' || job.kind === 'decline') {
            const p = db.proposals.find(x => x.id === job.proposalId);
            text = fill(Util.pick(BOT[job.kind]), { ...vars, when: p ? Fmt.whenSpoken(p.dateTime) : 'dann' });
          } else {
            const msgs = db.messages.filter(m => m.matchId === match.id).sort((a, b) => a.createdAt - b.createdAt);
            const lastFromOther = [...msgs].reverse().find(m => m.senderId !== job.botId);
            const botHasWritten = msgs.some(m => m.senderId === job.botId);
            const intent = detectIntent(lastFromOther ? lastFromOther.text : '', botHasWritten, idea);
            text = fill(pickTemplate(db, match.id, BOT.replies[intent] || BOT.replies.generic), vars);
          }
        }
        delete typing[match.id];
        const message = { id: Util.uid('msg'), matchId: match.id, senderId: job.botId, text, createdAt: Date.now(), read: false };
        db.messages.push(message);
        db.messages.forEach(m => { if (m.matchId === match.id && m.senderId !== job.botId) m.read = true; });
        events.push(['typing', { matchId: match.id, userId: job.botId, typing: false }]);
        if (match.userIds.includes(meId)) events.push(['message', { matchId: match.id, message: { ...message }, senderName: bot ? bot.name : '' }]);
        if (job.kind === 'reply' && Math.random() < 0.22) scheduleBotMessage(db, match.id, job.botId, 'followUp', Util.randInt(1200, 2400));
        return;
      }
      case 'botRespondProposal': {
        const p = db.proposals.find(x => x.id === job.proposalId);
        if (!p || p.status !== 'proposed') return;
        const match = db.matches.find(m => m.id === p.matchId);
        if (!match) return;
        const confirm = Math.random() < 0.85; // hohe Zusage-Wahrscheinlichkeit
        p.status = confirm ? 'confirmed' : 'declined';
        p.respondedAt = Date.now();
        const bot = userById(db, job.botId);
        if (match.userIds.includes(meId)) events.push(['proposal', { matchId: p.matchId, proposal: { ...p }, byName: bot ? bot.name : '' }]);
        scheduleBotMessage(db, p.matchId, job.botId, confirm ? 'confirm' : 'decline', Util.randInt(700, 1400), { proposalId: p.id });
        return;
      }
      case 'botLikeUserIdea': {
        const user = userById(db, job.userId);
        if (!user) return;
        const ideas = db.ideas.filter(i => i.ownerId === user.id && i.active && !i.deletedAt);
        if (!ideas.length) return;
        const likedBy = new Set(db.likes.filter(l => l.toUserId === user.id).map(l => l.fromUserId));
        const bots = db.users.filter(u => u.isBot && u.id !== user.id && compatible(u, user) && !likedBy.has(u.id) && !matchBetween(db, u.id, user.id));
        if (!bots.length) return;
        const bot = Util.pick(bots);
        const idea = Util.pick(ideas);
        const like = { id: Util.uid('like'), fromUserId: bot.id, ideaId: idea.id, toUserId: user.id, status: 'pending', createdAt: Date.now(), message: Util.pick(BOT.likeMessages), respondedAt: null };
        db.likes.push(like);
        if (!job.silent && user.id === meId) events.push(['request', { likeId: like.id, fromName: bot.name, ideaTitle: idea.title }]);
        return;
      }
      default:
        console.warn('[Simulation] Unbekannter Job-Typ', job.type);
    }
  }
  /** Für wen ist ein Job relevant? (Bei mehreren offenen Tabs übernimmt bevorzugt der Tab dieser Person.) */
  function jobAffinity(db, job) {
    const matchOf = id => db.matches.find(m => m.id === id);
    if (job.matchId) { const m = matchOf(job.matchId); return m ? m.userIds.find(id => id !== job.botId) : null; }
    if (job.type === 'botRespondLike') { const l = db.likes.find(x => x.id === job.likeId); return l ? l.fromUserId : null; }
    if (job.type === 'botRespondProposal') {
      const p = db.proposals.find(x => x.id === job.proposalId);
      const m = p && matchOf(p.matchId);
      return m ? m.userIds.find(id => id !== job.botId) : null;
    }
    if (job.type === 'botLikeUserIdea') return job.userId;
    return null;
  }
  /** Taktgeber der Simulation (alle 500 ms): fällige Jobs ausführen. */
  function tick() {
    if (!settings().autoReplies) return;
    const db = loadDB();
    if (!db || !db.botQueue || !db.botQueue.length) return;
    const now = Date.now();
    const meId = sessionUserId(db);
    const GRACE_MS = 2000; // andere Tabs springen erst ein, wenn der „richtige“ Tab nicht reagiert
    const due = db.botQueue
      .filter(j => j.dueAt <= now && (j.dueAt <= now - GRACE_MS || !jobAffinity(db, j) || jobAffinity(db, j) === meId))
      .sort((a, b) => a.dueAt - b.dueAt);
    if (!due.length) return;
    const dueIds = new Set(due.map(j => j.id));
    db.botQueue = db.botQueue.filter(j => !dueIds.has(j.id));
    const events = [];
    for (const job of due) {
      try { runJob(db, job, events); } catch (e) { console.warn('[Simulation] Job fehlgeschlagen:', job, e); }
    }
    saveDB(db);
    events.forEach(([type, detail]) => emit(type, detail));
    changed('simulation');
  }

  /* ---------- Validierung ---------- */
  function validateIdea(data) {
    const f = {};
    const title = String(data.title || '').trim();
    const description = String(data.description || '').trim();
    const location = String(data.location || '').trim();
    if (title.length < 5) f.title = 'Gib deiner Idee einen Titel (mind. 5 Zeichen).';
    else if (title.length > 80) f.title = 'Der Titel darf höchstens 80 Zeichen lang sein.';
    if (description.length < 20) f.description = 'Beschreib kurz, was ihr macht (mind. 20 Zeichen).';
    else if (description.length > 300) f.description = 'Die Beschreibung darf höchstens 300 Zeichen lang sein.';
    if (!CAT[data.category]) f.category = 'Bitte wähle eine Kategorie.';
    if (!BUDGETS.some(b => b.value === data.budget)) f.budget = 'Bitte wähle ein Budget.';
    if (!DURATIONS.includes(data.duration)) f.duration = 'Bitte wähle eine Dauer.';
    if (!TIME[data.timeOfDay]) f.timeOfDay = 'Bitte wähle eine Tageszeit.';
    if (location.length < 3) f.location = 'Wo trefft ihr euch? (mind. 3 Zeichen)';
    else if (location.length > 70) f.location = 'Höchstens 70 Zeichen.';
    if (Object.keys(f).length) throw validationError(f);
    return { title, description, category: data.category, budget: data.budget, duration: data.duration, timeOfDay: data.timeOfDay, location,
      emoji: String(data.emoji || CAT[data.category].emoji).slice(0, 8) };
  }
  function validateProfilePatch(p) {
    const f = {};
    const out = {};
    if ('name' in p) {
      const name = String(p.name || '').trim().replace(/\s+/g, ' ');
      if (name.length < 2) f.name = 'Bitte gib deinen Vornamen ein (mind. 2 Zeichen).';
      else if (name.length > 30) f.name = 'Höchstens 30 Zeichen.';
      else if (!/^[\p{L}][\p{L}' -]*$/u.test(name)) f.name = 'Bitte nur Buchstaben verwenden.';
      out.name = name;
    }
    if ('birthdate' in p) {
      const age = Util.ageFrom(p.birthdate);
      if (!p.birthdate || age === null) f.birthdate = 'Bitte gib dein Geburtsdatum ein.';
      else if (age < 18) f.birthdate = 'Du musst mindestens 18 Jahre alt sein, um asap zu nutzen.';
      else if (age > 100) f.birthdate = 'Bitte überprüfe das Geburtsdatum.';
      out.birthdate = p.birthdate;
    }
    if ('gender' in p) { if (!GENDER[p.gender]) f.gender = 'Bitte wähle eine Option.'; out.gender = p.gender; }
    if ('interestedIn' in p) {
      const arr = Array.isArray(p.interestedIn) ? p.interestedIn.filter(g => GENDER[g]) : [];
      if (!arr.length) f.interestedIn = 'Bitte wähle, für wen du dich interessierst.';
      out.interestedIn = arr;
    }
    if ('city' in p) {
      const city = String(p.city || '').trim();
      if (city.length < 2) f.city = 'Bitte gib deine Stadt oder deinen Stadtteil ein.';
      else if (city.length > 60) f.city = 'Höchstens 60 Zeichen.';
      out.city = city;
    }
    if ('bio' in p) {
      const bio = String(p.bio || '').trim();
      if (bio.length > 300) f.bio = 'Höchstens 300 Zeichen.';
      out.bio = bio;
    }
    if ('interests' in p) {
      const tags = Array.isArray(p.interests) ? [...new Set(p.interests.filter(t => INTEREST_TAGS.includes(t)))] : [];
      if (tags.length < 3) f.interests = 'Wähle mindestens 3 Interessen.';
      else if (tags.length > 10) f.interests = 'Höchstens 10 Interessen.';
      out.interests = tags;
    }
    if ('photos' in p) {
      const photos = Array.isArray(p.photos) ? p.photos.slice(0, 3).map((ph, i) => ({
        id: ph.id || Util.uid('ph' + i), colors: [String(ph.colors[0]), String(ph.colors[1])], emoji: ph.emoji || null, pattern: Number(ph.pattern) || 0,
      })) : [];
      if (!photos.length) f.photos = 'Wähle mindestens ein Profilbild.';
      out.photos = photos;
    }
    if ('onboardingStep' in p) out.onboardingStep = Math.max(0, Number(p.onboardingStep) || 0);
    if (Object.keys(f).length) throw validationError(f);
    return out;
  }

  /* ===========================================================================
     ÖFFENTLICHE API
     =========================================================================== */
  const api = {
    on,
    /** Initialisiert die Mock-DB (Seed) und startet die Simulation. */
    init() {
      if (ready) return ready;
      ready = (async () => {
        const db = loadDB();
        if (!db || db.version !== 1) saveDB(await buildSeedDB());
        window.addEventListener('storage', e => {
          // Änderungen aus einem anderen Tab (z. B. zweiter Account parallel)
          if (e.key === KEY_DB) { emit('sync', {}); changed('sync'); }
          if (e.key === KEY_SESSION) emit('session', { external: true });
        });
        tickTimer = setInterval(tick, 500);
      })();
      return ready;
    },
    get pendingRequests() { return pending; },
    get storageMode() { return SafeStorage.local.persistent ? 'localStorage' : 'Arbeitsspeicher'; },

    /* ----- Auth ----- */
    // BACKEND: POST /api/v1/auth/register  { email, password }
    register({ email, password, passwordRepeat }) {
      return request('POST /auth/register', async () => {
        const f = {};
        const em = String(email || '').trim().toLowerCase();
        if (!Util.isValidEmail(em)) f.email = 'Bitte gib eine gültige E-Mail-Adresse ein.';
        if (String(password || '').length < 8) f.password = 'Das Passwort muss mindestens 8 Zeichen lang sein.';
        if (password !== passwordRepeat) f.passwordRepeat = 'Die Passwörter stimmen nicht überein.';
        if (!f.email && read(db => db.users.some(u => u.email.toLowerCase() === em))) f.email = 'Diese E-Mail-Adresse ist bereits registriert.';
        if (Object.keys(f).length) throw validationError(f);
        const passwordHash = await hashPassword(em, password);
        const user = write(db => {
          if (db.users.some(u => u.email.toLowerCase() === em)) throw validationError({ email: 'Diese E-Mail-Adresse ist bereits registriert.' });
          const u = { id: Util.uid('u'), email: em, passwordHash, name: '', birthdate: null, gender: null, interestedIn: [], city: '', bio: '',
            photos: [], interests: [], createdAt: Date.now(), isBot: false, isTestAccount: false, profileComplete: false, onboardingStep: 0, botLikesSeeded: false };
          db.users.push(u);
          createSession(db, u.id, true);
          return privateUser(u, db);
        });
        emit('session', { userId: user.id, user });
        return user;
      });
    },
    // BACKEND: POST /api/v1/auth/login  { email, password, remember } → Session-Cookie/Token
    login({ email, password, remember }) {
      return request('POST /auth/login', async () => {
        const em = String(email || '').trim().toLowerCase();
        if (!em || !password) throw new ApiError('Bitte gib E-Mail und Passwort ein.', 'VALIDATION');
        const hash = await hashPassword(em, password);
        const user = write(db => {
          const u = db.users.find(x => x.email.toLowerCase() === em);
          if (!u || u.passwordHash !== hash) throw new ApiError('E-Mail oder Passwort ist falsch.', 'INVALID_CREDENTIALS');
          createSession(db, u.id, !!remember);
          return privateUser(u, db);
        });
        emit('session', { userId: user.id, user });
        return user;
      });
    },
    // BACKEND: POST /api/v1/auth/logout
    logout() {
      return request('POST /auth/logout', () => {
        const s = readSession();
        const db = loadDB();
        if (db && s) { db.sessions = db.sessions.filter(x => x.token !== s.token); saveDB(db); }
        clearSessionStorage();
        emit('session', { userId: null });
        return true;
      });
    },
    // BACKEND: GET /api/v1/me
    getCurrentUser() {
      return request('GET /me', () => read(db => {
        const id = sessionUserId(db);
        return id ? privateUser(userById(db, id), db) : null;
      }));
    },
    // BACKEND: PATCH /api/v1/me
    updateProfile(patch) {
      return request('PATCH /me', () => {
        const clean = validateProfilePatch(patch || {});
        const u = write(db => { const me = requireMe(db); Object.assign(me, clean); return privateUser(me, db); });
        changed('profile');
        return u;
      });
    },
    // BACKEND: POST /api/v1/me/onboarding/complete
    completeOnboarding() {
      return request('POST /me/onboarding/complete', () => {
        const u = write(db => {
          const me = requireMe(db);
          const f = {};
          if (!me.name) f.name = 'Name fehlt.';
          if (!me.birthdate || Util.ageFrom(me.birthdate) < 18) f.birthdate = 'Du musst mindestens 18 Jahre alt sein.';
          if (!me.gender) f.gender = 'Geschlecht fehlt.';
          if (!me.interestedIn || !me.interestedIn.length) f.interestedIn = 'Interesse fehlt.';
          if (!me.city) f.city = 'Stadt fehlt.';
          if (!me.interests || me.interests.length < 3) f.interests = 'Mindestens 3 Interessen.';
          if (!me.photos || !me.photos.length) f.photos = 'Profilbild fehlt.';
          if (Object.keys(f).length) throw validationError(f, 'Dein Profil ist noch nicht vollständig.');
          me.profileComplete = true;
          me.onboardingStep = 99;
          return privateUser(me, db);
        });
        changed('profile');
        return u;
      });
    },

    /* ----- Feed & Likes ----- */
    // BACKEND: GET /api/v1/feed?categories=…&budgets=…&times=…&maxDistance=…
    getFeed(filters = {}) {
      return request('GET /feed', () => read(db => {
        const me = requireMe(db);
        const hasIdea = db.ideas.some(i => i.ownerId === me.id && i.active && !i.deletedAt);
        if (!hasIdea) return { locked: true, items: [], totalBeforeFilter: 0 };
        const liked = new Set(db.likes.filter(l => l.fromUserId === me.id).map(l => l.ideaId));
        const passed = new Set(db.passes.filter(p => p.userId === me.id).map(p => p.ideaId));
        const matched = new Set(db.matches.filter(m => m.userIds.includes(me.id)).map(m => otherIdOf(m, me.id)));
        let items = db.ideas
          .filter(i => i.active && !i.deletedAt && i.ownerId !== me.id && !liked.has(i.id) && !passed.has(i.id) && !matched.has(i.ownerId))
          .map(i => ({ i, owner: userById(db, i.ownerId) }))
          .filter(x => x.owner && compatible(me, x.owner))
          .map(x => ({ idea: publicIdea(x.i), owner: publicUser(x.owner, me), distanceKm: distanceKm(me, x.owner) }));
        const totalBeforeFilter = items.length;
        if (filters.categories && filters.categories.length) items = items.filter(x => filters.categories.includes(x.idea.category));
        if (filters.budgets && filters.budgets.length) items = items.filter(x => filters.budgets.includes(x.idea.budget));
        if (filters.times && filters.times.length) items = items.filter(x => filters.times.includes(x.idea.timeOfDay));
        if (filters.maxDistance) items = items.filter(x => x.distanceKm <= filters.maxDistance);
        // Reihenfolge: täglich wechselnd, Nähe leicht bevorzugt
        const day = new Date().toDateString();
        const score = x => (Util.hash(me.id + day + x.idea.id) % 1000) / 1000 * 18 + x.distanceKm * 0.35;
        items.sort((a, b) => score(a) - score(b));
        return { locked: false, items, totalBeforeFilter };
      }));
    },
    // BACKEND: POST /api/v1/ideas/:ideaId/likes  { message? }
    likeIdea(ideaId, message = '') {
      return request('POST /ideas/:id/likes', () => {
        const like = write(db => {
          const me = requireMe(db);
          if (!db.ideas.some(i => i.ownerId === me.id && i.active && !i.deletedAt)) throw new ApiError('Lege zuerst eine eigene aktive Idee an.', 'NEEDS_IDEA');
          const idea = db.ideas.find(i => i.id === ideaId);
          if (!idea || !idea.active || idea.deletedAt) throw new ApiError('Diese Idee ist leider nicht mehr verfügbar.', 'NOT_FOUND');
          if (idea.ownerId === me.id) throw new ApiError('Du kannst deine eigene Idee nicht liken.', 'FORBIDDEN');
          if (db.likes.some(l => l.fromUserId === me.id && l.ideaId === ideaId)) throw new ApiError('Du hast diese Idee bereits gelikt.', 'DUPLICATE');
          const text = String(message || '').trim().slice(0, 200);
          const l = { id: Util.uid('like'), fromUserId: me.id, ideaId, toUserId: idea.ownerId, status: 'pending', createdAt: Date.now(), message: text || null, respondedAt: null };
          db.likes.push(l);
          // SIMULATION: Testaccount nimmt mit ~50 % Wahrscheinlichkeit nach 3–10 s an.
          const owner = userById(db, idea.ownerId);
          if (owner && owner.isBot && settings().autoReplies) {
            enqueue(db, { type: 'botRespondLike', likeId: l.id, accept: Math.random() < 0.5 }, Util.randInt(3000, 10000));
          }
          return { ...l };
        });
        changed('like');
        return like;
      });
    },
    // BACKEND: POST /api/v1/ideas/:ideaId/pass
    passIdea(ideaId) {
      return request('POST /ideas/:id/pass', () => {
        write(db => {
          const me = requireMe(db);
          if (!db.passes.some(p => p.userId === me.id && p.ideaId === ideaId)) db.passes.push({ id: Util.uid('pass'), userId: me.id, ideaId, createdAt: Date.now() });
        });
        return true;
      });
    },
    // BACKEND: DELETE /api/v1/me/passes
    resetPasses() {
      return request('DELETE /me/passes', () => {
        const n = write(db => { const me = requireMe(db); const before = db.passes.length; db.passes = db.passes.filter(p => p.userId !== me.id); return before - db.passes.length; });
        changed('passes');
        return n;
      });
    },
    // BACKEND: GET /api/v1/me/likes/received
    getRequests() {
      return request('GET /me/likes/received', () => read(db => {
        const me = requireMe(db);
        return db.likes.filter(l => l.toUserId === me.id && l.status === 'pending')
          .sort((a, b) => b.createdAt - a.createdAt)
          .map(l => ({ id: l.id, createdAt: l.createdAt, message: l.message, from: publicUser(userById(db, l.fromUserId), me), idea: publicIdea(db.ideas.find(i => i.id === l.ideaId)) }));
      }));
    },
    // BACKEND: GET /api/v1/me/likes/sent  (Ablehnungen werden serverseitig als „offen“ ausgeliefert)
    getSentLikes() {
      return request('GET /me/likes/sent', () => read(db => {
        const me = requireMe(db);
        return db.likes.filter(l => l.fromUserId === me.id)
          .sort((a, b) => b.createdAt - a.createdAt)
          .map(l => {
            const match = matchBetween(db, me.id, l.toUserId);
            const idea = db.ideas.find(i => i.id === l.ideaId);
            return { id: l.id, createdAt: l.createdAt, message: l.message, status: match ? 'matched' : 'pending', matchId: match ? match.id : null,
              idea: publicIdea(idea), ideaUnavailable: !idea || !!idea.deletedAt, owner: publicUser(userById(db, l.toUserId), me) };
          });
      }));
    },
    // BACKEND: POST /api/v1/likes/:likeId/accept  bzw.  /decline
    respondToLike(likeId, accept) {
      return request(accept ? 'POST /likes/:id/accept' : 'POST /likes/:id/decline', () => {
        const res = write(db => {
          const me = requireMe(db);
          const like = db.likes.find(l => l.id === likeId && l.toUserId === me.id);
          if (!like) throw new ApiError('Diese Anfrage existiert nicht mehr.', 'NOT_FOUND');
          if (like.status !== 'pending') throw new ApiError('Diese Anfrage wurde bereits beantwortet.', 'CONFLICT');
          like.respondedAt = Date.now();
          if (!accept) { like.status = 'declined'; return { accepted: false }; }
          like.status = 'accepted';
          const match = createMatch(db, like, me.id);
          return { accepted: true, ...matchPayload(db, match, me.id) };
        });
        changed('like-response');
        return res;
      });
    },

    /* ----- Matches & Chat ----- */
    // BACKEND: GET /api/v1/matches
    getMatches() {
      return request('GET /matches', () => read(db => {
        const me = requireMe(db);
        const now = Date.now();
        return db.matches.filter(m => m.userIds.includes(me.id)).map(m => {
          const other = userById(db, otherIdOf(m, me.id));
          const msgs = db.messages.filter(x => x.matchId === m.id);
          const props = db.proposals.filter(p => p.matchId === m.id);
          const timeline = [
            ...msgs.map(x => ({ kind: 'message', at: x.createdAt, text: x.text, senderId: x.senderId })),
            ...props.map(p => ({ kind: 'proposal', at: p.respondedAt || p.createdAt, text: proposalPreview(p, me.id, other.name), senderId: p.proposedBy })),
          ].sort((a, b) => b.at - a.at);
          const next = props.filter(p => p.status === 'confirmed' && new Date(p.dateTime).getTime() > now).sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime))[0];
          const last = timeline[0] || null;
          return {
            id: m.id, createdAt: m.createdAt, other: publicUser(other, me), idea: publicIdea(db.ideas.find(i => i.id === m.ideaId)),
            last, hasMessages: msgs.length > 0,
            unread: msgs.filter(x => x.senderId !== me.id && !x.read).length,
            pendingProposal: props.some(p => p.status === 'proposed' && p.proposedBy !== me.id),
            isNew: !(m.seenBy || []).includes(me.id),
            typing: typing[m.id] === other.id,
            nextDate: next ? next.dateTime : null,
            lastActivity: last ? last.at : m.createdAt,
          };
        }).sort((a, b) => b.lastActivity - a.lastActivity);
      }));
    },
    // BACKEND: GET /api/v1/matches/:matchId/messages
    getMessages(matchId) {
      return request('GET /matches/:id/messages', () => read(db => {
        const me = requireMe(db);
        const m = db.matches.find(x => x.id === matchId && x.userIds.includes(me.id));
        if (!m) throw new ApiError('Dieser Chat existiert nicht (mehr).', 'NOT_FOUND');
        const other = userById(db, otherIdOf(m, me.id));
        const items = [
          ...db.messages.filter(x => x.matchId === m.id).map(x => ({ kind: 'message', ...x })),
          ...db.proposals.filter(p => p.matchId === m.id).map(p => ({ kind: 'proposal', ...p })),
        ].sort((a, b) => a.createdAt - b.createdAt);
        return { match: { id: m.id, createdAt: m.createdAt, ideaId: m.ideaId }, me: publicUser(me), other: publicUser(other, me),
          idea: publicIdea(db.ideas.find(i => i.id === m.ideaId)), items, typing: typing[m.id] === other.id };
      }));
    },
    // BACKEND: POST /api/v1/matches/:matchId/read
    markAsRead(matchId) {
      return request('POST /matches/:id/read', () => {
        const changedAny = write(db => {
          const me = requireMe(db);
          const m = db.matches.find(x => x.id === matchId && x.userIds.includes(me.id));
          if (!m) return false;
          let c = false;
          if (!(m.seenBy || []).includes(me.id)) { m.seenBy = [...(m.seenBy || []), me.id]; c = true; }
          db.messages.forEach(x => { if (x.matchId === m.id && x.senderId !== me.id && !x.read) { x.read = true; c = true; } });
          return c;
        });
        if (changedAny) changed('read');
        return true;
      });
    },
    // BACKEND: POST /api/v1/matches/:matchId/messages  { text }
    sendMessage(matchId, text) {
      return request('POST /matches/:id/messages', () => {
        const message = write(db => {
          const me = requireMe(db);
          const m = db.matches.find(x => x.id === matchId && x.userIds.includes(me.id));
          if (!m) throw new ApiError('Dieser Chat existiert nicht (mehr).', 'NOT_FOUND');
          const t = String(text || '').trim();
          if (!t) throw new ApiError('Die Nachricht ist leer.', 'VALIDATION');
          if (t.length > 1000) throw new ApiError('Die Nachricht ist zu lang (max. 1000 Zeichen).', 'VALIDATION');
          const msg = { id: Util.uid('msg'), matchId: m.id, senderId: me.id, text: t, createdAt: Date.now(), read: false };
          db.messages.push(msg);
          if (!(m.seenBy || []).includes(me.id)) m.seenBy = [...(m.seenBy || []), me.id];
          // SIMULATION: Testaccount liest, tippt und antwortet.
          const other = userById(db, otherIdOf(m, me.id));
          if (other && other.isBot && settings().autoReplies) {
            db.botQueue = (db.botQueue || []).filter(j => !(j.type === 'botOpener' && j.matchId === m.id));
            const queued = db.botQueue.find(j => j.type === 'botSay' && j.matchId === m.id && j.kind === 'reply');
            if (queued) queued.dueAt = Math.max(queued.dueAt, Date.now() + 2200);
            else {
              enqueue(db, { type: 'botRead', matchId: m.id, botId: other.id }, Util.randInt(600, 1400));
              scheduleBotMessage(db, m.id, other.id, 'reply', Util.randInt(1500, 2500));
            }
          }
          return { ...msg };
        });
        changed('message');
        return message;
      });
    },
    // BACKEND: POST /api/v1/matches/:matchId/proposals  { dateTime }
    proposeDate(matchId, dateTime) {
      return request('POST /matches/:id/proposals', () => {
        const p = write(db => {
          const me = requireMe(db);
          const m = db.matches.find(x => x.id === matchId && x.userIds.includes(me.id));
          if (!m) throw new ApiError('Dieser Chat existiert nicht (mehr).', 'NOT_FOUND');
          const d = new Date(dateTime);
          if (isNaN(d)) throw validationError({ dateTime: 'Bitte wähle Datum und Uhrzeit.' });
          if (d.getTime() < Date.now() + 10 * MIN) throw validationError({ dateTime: 'Der Termin muss in der Zukunft liegen.' });
          if (d.getTime() > Date.now() + 365 * DAY) throw validationError({ dateTime: 'Bitte wähle einen Termin innerhalb der nächsten 12 Monate.' });
          const proposal = { id: Util.uid('prop'), matchId: m.id, proposedBy: me.id, dateTime: d.toISOString(), status: 'proposed', createdAt: Date.now(), respondedAt: null };
          db.proposals.push(proposal);
          const other = userById(db, otherIdOf(m, me.id));
          if (other && other.isBot && settings().autoReplies) {
            enqueue(db, { type: 'botRespondProposal', proposalId: proposal.id, botId: other.id }, Util.randInt(2000, 6000));
          }
          return { ...proposal };
        });
        changed('proposal');
        return p;
      });
    },
    // BACKEND: POST /api/v1/proposals/:proposalId/confirm  bzw.  /decline
    respondToProposal(proposalId, accept) {
      return request('POST /proposals/:id/respond', () => {
        const p = write(db => {
          const me = requireMe(db);
          const proposal = db.proposals.find(x => x.id === proposalId);
          const m = proposal && db.matches.find(x => x.id === proposal.matchId && x.userIds.includes(me.id));
          if (!proposal || !m) throw new ApiError('Dieser Terminvorschlag existiert nicht mehr.', 'NOT_FOUND');
          if (proposal.proposedBy === me.id) throw new ApiError('Du kannst deinen eigenen Vorschlag nicht beantworten.', 'FORBIDDEN');
          if (proposal.status !== 'proposed') throw new ApiError('Dieser Vorschlag wurde bereits beantwortet.', 'CONFLICT');
          proposal.status = accept ? 'confirmed' : 'declined';
          proposal.respondedAt = Date.now();
          return { ...proposal };
        });
        changed('proposal');
        return p;
      });
    },
    // BACKEND: GET /api/v1/me/dates
    getMyDates() {
      return request('GET /me/dates', () => read(db => {
        const me = requireMe(db);
        const myMatches = db.matches.filter(m => m.userIds.includes(me.id));
        const byId = Object.fromEntries(myMatches.map(m => [m.id, m]));
        const list = db.proposals.filter(p => byId[p.matchId]).map(p => {
          const m = byId[p.matchId];
          return { proposal: { ...p }, matchId: m.id, other: publicUser(userById(db, otherIdOf(m, me.id)), me), idea: publicIdea(db.ideas.find(i => i.id === m.ideaId)), mine: p.proposedBy === me.id };
        });
        const now = Date.now();
        const t = x => new Date(x.proposal.dateTime).getTime();
        return {
          upcoming: list.filter(x => x.proposal.status === 'confirmed' && t(x) >= now - 3 * HOUR).sort((a, b) => t(a) - t(b)),
          pending: list.filter(x => x.proposal.status === 'proposed' && t(x) > now).sort((a, b) => t(a) - t(b)),
          past: list.filter(x => x.proposal.status === 'confirmed' && t(x) < now - 3 * HOUR).sort((a, b) => t(b) - t(a)),
        };
      }));
    },

    /* ----- Eigene Ideen ----- */
    // BACKEND: GET /api/v1/me/ideas
    getMyIdeas() {
      return request('GET /me/ideas', () => read(db => {
        const me = requireMe(db);
        return db.ideas.filter(i => i.ownerId === me.id && !i.deletedAt)
          .sort((a, b) => (b.active - a.active) || (b.createdAt - a.createdAt))
          .map(i => ({ ...i,
            pendingLikes: db.likes.filter(l => l.ideaId === i.id && l.status === 'pending').length,
            matchCount: db.matches.filter(m => m.ideaId === i.id).length }));
      }));
    },
    // BACKEND: GET /api/v1/ideas/:ideaId
    getIdea(ideaId) {
      return request('GET /ideas/:id', () => read(db => {
        const me = requireMe(db);
        const i = db.ideas.find(x => x.id === ideaId && !x.deletedAt);
        if (!i) throw new ApiError('Diese Idee existiert nicht (mehr).', 'NOT_FOUND');
        if (i.ownerId !== me.id) throw new ApiError('Du kannst nur deine eigenen Ideen bearbeiten.', 'FORBIDDEN');
        return publicIdea(i);
      }));
    },
    // BACKEND: POST /api/v1/ideas
    createIdea(data) {
      return request('POST /ideas', () => {
        const clean = validateIdea(data || {});
        const idea = write(db => {
          const me = requireMe(db);
          if (db.ideas.filter(i => i.ownerId === me.id && !i.deletedAt).length >= 10) throw new ApiError('Du kannst höchstens 10 Ideen gleichzeitig haben.', 'LIMIT');
          const i = { id: Util.uid('idea'), ownerId: me.id, ...clean, active: true, deletedAt: null, createdAt: Date.now() };
          db.ideas.push(i);
          if (!me.botLikesSeeded) seedBotLikesForNewUser(db, me);
          return publicIdea(i);
        });
        changed('idea');
        return idea;
      });
    },
    // BACKEND: PUT /api/v1/ideas/:ideaId
    updateIdea(ideaId, data) {
      return request('PUT /ideas/:id', () => {
        const clean = validateIdea(data || {});
        const idea = write(db => {
          const me = requireMe(db);
          const i = db.ideas.find(x => x.id === ideaId && !x.deletedAt);
          if (!i || i.ownerId !== me.id) throw new ApiError('Diese Idee kannst du nicht bearbeiten.', 'FORBIDDEN');
          Object.assign(i, clean, { updatedAt: Date.now() });
          return publicIdea(i);
        });
        changed('idea');
        return idea;
      });
    },
    // BACKEND: PATCH /api/v1/ideas/:ideaId  { active }
    setIdeaActive(ideaId, active) {
      return request('PATCH /ideas/:id', () => {
        const idea = write(db => {
          const me = requireMe(db);
          const i = db.ideas.find(x => x.id === ideaId && !x.deletedAt);
          if (!i || i.ownerId !== me.id) throw new ApiError('Diese Idee kannst du nicht ändern.', 'FORBIDDEN');
          i.active = !!active;
          return publicIdea(i);
        });
        changed('idea');
        return idea;
      });
    },
    // BACKEND: DELETE /api/v1/ideas/:ideaId  (Soft-Delete, damit bestehende Matches ihre Idee behalten)
    deleteIdea(ideaId) {
      return request('DELETE /ideas/:id', () => {
        write(db => {
          const me = requireMe(db);
          const i = db.ideas.find(x => x.id === ideaId && !x.deletedAt);
          if (!i || i.ownerId !== me.id) throw new ApiError('Diese Idee kannst du nicht löschen.', 'FORBIDDEN');
          i.deletedAt = Date.now();
          i.active = false;
          db.likes.forEach(l => { if (l.ideaId === i.id && l.status === 'pending') { l.status = 'declined'; l.respondedAt = Date.now(); } });
        });
        changed('idea');
        return true;
      });
    },

    /* ----- Profile anderer ----- */
    // BACKEND: GET /api/v1/users/:userId
    getUserProfile(userId) {
      return request('GET /users/:id', () => read(db => {
        const me = requireMe(db);
        const u = userById(db, userId);
        if (!u) throw new ApiError('Dieses Profil existiert nicht (mehr).', 'NOT_FOUND');
        const isMe = u.id === me.id;
        const myLikes = new Set(db.likes.filter(l => l.fromUserId === me.id).map(l => l.ideaId));
        const match = isMe ? null : matchBetween(db, me.id, u.id);
        const ideas = db.ideas.filter(i => i.ownerId === u.id && !i.deletedAt && (isMe || i.active)).sort((a, b) => b.createdAt - a.createdAt);
        return {
          user: publicUser(u, me), isMe, compatible: isMe || compatible(me, u), matchId: match ? match.id : null,
          canLike: !isMe && db.ideas.some(i => i.ownerId === me.id && i.active && !i.deletedAt),
          incoming: isMe ? [] : db.likes.filter(l => l.fromUserId === u.id && l.toUserId === me.id && l.status === 'pending')
            .map(l => ({ id: l.id, message: l.message, createdAt: l.createdAt, idea: publicIdea(db.ideas.find(i => i.id === l.ideaId)) })),
          ideas: ideas.map(i => ({ idea: publicIdea(i), liked: myLikes.has(i.id) })),
        };
      }));
    },
    // BACKEND: GET /api/v1/me/badges
    getBadges() {
      return request('GET /me/badges', () => read(db => {
        const me = requireMe(db);
        const requests = db.likes.filter(l => l.toUserId === me.id && l.status === 'pending').length;
        const chats = db.matches.filter(m => m.userIds.includes(me.id)).filter(m =>
          !(m.seenBy || []).includes(me.id)
          || db.messages.some(x => x.matchId === m.id && x.senderId !== me.id && !x.read)
          || db.proposals.some(p => p.matchId === m.id && p.status === 'proposed' && p.proposedBy !== me.id)).length;
        return { requests, chats };
      }));
    },

    /* ----- Entwickler-Funktionen (NUR für den Prototyp – in Produktion entfernen!) ----- */
    dev: {
      testAccounts() {
        const db = loadDB();
        return TEST_ACCOUNTS.map(a => {
          const u = db && userById(db, a.id);
          return { ...a, name: u ? u.name : a.email };
        });
      },
      listUsers() {
        return request('DEV users', () => read(db => db.users.map(u => ({
          id: u.id, name: u.name || '(ohne Namen)', email: u.email, isBot: !!u.isBot, isTestAccount: !!u.isTestAccount,
          age: Util.ageFrom(u.birthdate), gender: u.gender, city: u.city }))));
      },
      /** Ohne Passwort als beliebige Person einloggen (Impersonation) – nur für Tests! */
      switchUser(userId) {
        return request('DEV switch', () => {
          const u = write(db => {
            const target = userById(db, userId);
            if (!target) throw new ApiError('Nutzer nicht gefunden.', 'NOT_FOUND');
            createSession(db, target.id, true);
            return privateUser(target, db);
          });
          emit('session', { userId: u.id, user: u });
          return u;
        });
      },
      getSettings() { return settings(); },
      setAutoReplies(onOff) {
        const s = settings();
        s.autoReplies = !!onOff;
        saveSettings(s);
        emit('settings', s);
        return s;
      },
      resetAll() {
        return request('DEV reset', async () => {
          SafeStorage.local.remove(KEY_SESSION);
          SafeStorage.session.remove(KEY_SESSION);
          SafeStorage.local.remove(KEY_SETTINGS);
          Object.keys(typing).forEach(k => delete typing[k]);
          saveDB(await buildSeedDB());
          emit('session', { userId: null, reset: true });
          changed('reset');
          return true;
        });
      },
      simulateIncomingLike() {
        return request('DEV simulate like', () => {
          const events = [];
          write(db => { const me = requireMe(db); runJob(db, { type: 'botLikeUserIdea', userId: me.id }, events); });
          if (!events.length) throw new ApiError('Keine passende simulierte Person gefunden – oder du hast keine aktive Idee.', 'NONE');
          events.forEach(([type, detail]) => emit(type, detail));
          changed('simulation');
          return true;
        });
      },
      /** Alle geplanten Reaktionen sofort ausführen. */
      fastForward() {
        const db = loadDB();
        if (!db || !db.botQueue.length) return 0;
        const n = db.botQueue.length;
        const now = Date.now();
        db.botQueue.forEach((j, idx) => { j.dueAt = now - (n - idx); });
        saveDB(db);
        tick();
        return n;
      },
      stats() {
        const db = loadDB();
        if (!db) return { queue: 0, users: 0, ideas: 0, likes: 0, matches: 0, messages: 0 };
        return { queue: db.botQueue.length, users: db.users.length, ideas: db.ideas.filter(i => !i.deletedAt).length,
          likes: db.likes.length, matches: db.matches.length, messages: db.messages.length };
      },
    },
  };
  return api;
})();

export { DataService };
