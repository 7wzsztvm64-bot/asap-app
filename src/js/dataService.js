import { Util, ApiError } from './core.js';
import { t } from '../i18n/index.js';
import { supabase, setRememberSession, checkSupabaseHealth } from './supabase.js';
// Nur für die Entwickler-Funktionen; im Produktionsbuild entfernt Vite den Import (siehe api.dev)
import { TEST_ACCOUNTS, SEED_PEOPLE, seedUuid } from './seed.js';
import { validationError, distanceKm, validateCredentials, validateIdea, validateProfilePatch, validateMessage, validateProposalDate,
  proposalPreview, filterAndSortFeed } from './domain.js';

/* =============================================================================
   DATASERVICE – die EINZIGE Schicht mit Datenzugriff (Backend: Supabase)
   -----------------------------------------------------------------------------
   Die UI ruft ausschließlich diese async-Methoden auf und greift nie direkt auf
   Supabase, localStorage oder fetch zu.
   Einfaches Lesen/Schreiben läuft direkt über die Tabellen (RLS schützt),
   alles mit mehreren Schritten über Datenbank-Funktionen (supabase/migrations/).
   Zeitstempel kommen als Millisekunden, Termine als ISO-String.
   Echtzeit: Supabase Realtime → Events über DataService.on(type, fn):
   match, message, typing, read, request, proposal, change, session, sync, network.
   ============================================================================= */
const DataService = (() => {
  const HOUR = 3600000;
  const PHOTO_BUCKET = 'photos';
  const PHOTO_MAX_PX = 1280;       // längste Seite nach dem Verkleinern
  const PHOTO_URL_TTL = 1800;      // signierte Foto-Links gelten 30 Min. (Sekunden)
  const TYPING_MS = 4000;          // so lange bleibt „schreibt …“ ohne neues Signal sichtbar
  const TYPING_THROTTLE_MS = 2500; // höchstens so oft „schreibt …“ senden

  const listeners = new Map();
  const typing = {};               // matchId -> userId (flüchtig)
  const typingTimers = {};
  const lastTypingSent = {};
  const matchChannels = new Map(); // matchId -> Realtime-Kanal für „schreibt …“
  const names = new Map();         // userId -> Name (für Toasts bei Realtime-Events)
  const photoUrls = new Map();     // Storage-Pfad -> { url, until } (signierte Links wiederverwenden → Browser-Cache greift)
  let pending = 0;
  let ready = null;
  let dbChannel = null;
  let realtimeUserId = null;
  let realtimeStart = null;        // laufender/abgeschlossener Start der Realtime-Abos
  let knownUserId = null;          // zuletzt bekannte eingeloggte Person (erkennt Wechsel in anderen Tabs)
  let recoveryPending = false;     // App wurde über einen „Passwort vergessen“-Link geöffnet

  /* ---------- Event-Bus ---------- */
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
  function changed(source) { emit('change', { source }); }

  /* ---------- Fehler → ApiError ---------- */
  const AUTH_CODES = {
    invalid_credentials: 'INVALID_CREDENTIALS', email_not_confirmed: 'EMAIL_NOT_CONFIRMED',
    over_request_rate_limit: 'RATE_LIMIT', over_email_send_rate_limit: 'RATE_LIMIT', weak_password: 'WEAK_PASSWORD',
    session_not_found: 'UNAUTHORIZED', refresh_token_not_found: 'UNAUTHORIZED',
    email_address_not_authorized: 'EMAIL_NOT_AUTHORIZED', // Standard-Mailversand von Supabase nur an Team-Adressen
  };
  function apiError(code) { return new ApiError(t(`errors.${code}`), code); }
  function toApiError(e) {
    if (e instanceof ApiError) return e;
    // Eigene Fehler aus den Datenbank-Funktionen: message = Code, detail = betroffene Felder
    if (e && e.code === 'P0001' && t(`errors.${e.message}`) !== `errors.${e.message}`) {
      const err = apiError(e.message);
      if (e.details) {
        const text = e.message === 'PROFILE_INCOMPLETE' ? t('errors.missingField') : err.message;
        err.fields = Object.fromEntries(e.details.split(',').map(field => [field, text]));
      }
      return err;
    }
    // Storage (Foto-Upload): 413 = zu groß, 403 = Policy (z. B. schon 3 Dateien)
    if (e && e.name === 'StorageApiError') {
      const status = String(e.statusCode || e.status || '');
      return apiError(status === '413' ? 'PHOTO_TOO_LARGE' : status === '403' ? 'PHOTO_LIMIT' : 'PHOTO_UPLOAD');
    }
    if (e && e.name === 'StorageUnknownError') return apiError('NETWORK');
    if (e && e.code === 'email_address_invalid') return validationError({ email: t('validation.email') });
    if (e && AUTH_CODES[e.code]) return apiError(AUTH_CODES[e.code]);
    if (e && (e.code === 'PGRST301' || e.code === 'PGRST303')) return apiError('UNAUTHORIZED'); // JWT abgelaufen/ungültig
    if (e && (e.code === '22P02' || e.code === 'PGRST116')) return apiError('NOT_FOUND');        // ungültige ID / keine Zeile
    if (e && e.code === '42501') return apiError('FORBIDDEN');                                   // RLS hat abgelehnt
    if (e && (e.name === 'AuthRetryableFetchError' || e instanceof TypeError)) return apiError('NETWORK');
    console.error('[DataService]', e);
    return apiError('SERVER');
  }

  /* ---------- Anfragen ---------- */
  async function request(label, fn) {
    if (!supabase) throw apiError('NOT_CONFIGURED');
    pending++;
    emit('network', { pending, label });
    try {
      await ready;
      return await fn();
    } catch (e) {
      throw toApiError(e);
    } finally {
      pending--;
      emit('network', { pending, label });
    }
  }
  function unwrap({ data, error }) { if (error) throw error; return data; }
  async function rpc(fn, args) { return unwrap(await supabase.rpc(fn, args)); }
  const isUuid = id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id));

  async function myId() {
    const { data } = await supabase.auth.getSession();
    const id = data.session && data.session.user.id;
    if (!id) throw apiError('UNAUTHORIZED');
    return id;
  }

  /* ---------- Mapper: Datenbank (snake_case) → Formen für die UI ---------- */
  const ms = ts => (ts ? new Date(ts).getTime() : null);
  function mapIdea(r) {
    if (!r) return null;
    return { id: r.id, ownerId: r.owner_id, emoji: r.emoji, title: r.title, description: r.description, category: r.category,
      budget: r.budget, duration: r.duration, timeOfDay: r.time_of_day, location: r.location, active: r.active,
      deletedAt: ms(r.deleted_at), createdAt: ms(r.created_at), updatedAt: ms(r.updated_at) };
  }
  /** Öffentliches Profil (aus get_public_profiles / profile_card); viewer = eigenes Profil für Entfernung & gemeinsame Interessen. */
  function mapPublic(card, viewer) {
    if (!card) return null;
    const isOther = viewer && viewer.id !== card.id;
    return { id: card.id, name: card.name, age: card.age, gender: card.gender, city: card.city, bio: card.bio || '',
      photos: card.photos || [], interests: card.interests || [],
      distanceKm: isOther ? distanceKm(viewer, card) : null,
      sharedInterests: isOther ? (card.interests || []).filter(tag => (viewer.interests || []).includes(tag)) : [] };
  }
  function mapMessage(r) {
    return { id: r.id, matchId: r.match_id, senderId: r.sender_id, text: r.text, createdAt: ms(r.created_at), read: !!r.read_at, fromLike: !!r.from_like };
  }
  function mapProposal(r) {
    return { id: r.id, matchId: r.match_id, proposedBy: r.proposed_by, dateTime: new Date(r.date_time).toISOString(), status: r.status,
      createdAt: ms(r.created_at), respondedAt: ms(r.responded_at) };
  }
  function mapLike(r) {
    return { id: r.id, fromUserId: r.from_user_id, ideaId: r.idea_id, toUserId: r.to_user_id, status: r.status,
      createdAt: ms(r.created_at), message: r.message, respondedAt: ms(r.responded_at) };
  }

  /* ---------- Fotos (Supabase Storage, privater Bucket) ---------- */
  /** Hängt an echte Fotos (mit path) einen signierten Link (url). Platzhalter bleiben unverändert. */
  async function attachPhotoUrls(photoLists) {
    const photos = photoLists.flat().filter(ph => ph && ph.path);
    if (!photos.length) return;
    const now = Date.now();
    const missing = [...new Set(photos.filter(ph => !(photoUrls.get(ph.path) && photoUrls.get(ph.path).until > now)).map(ph => ph.path))];
    if (missing.length) {
      const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(missing, PHOTO_URL_TTL);
      if (error) console.warn('[DataService] Foto-Links:', error); // ohne Link zeigt die UI den Farbverlauf
      (data || []).forEach(d => {
        if (d.signedUrl) photoUrls.set(d.path, { url: d.signedUrl, until: now + (PHOTO_URL_TTL - 300) * 1000 });
      });
    }
    photos.forEach(ph => { const c = photoUrls.get(ph.path); if (c) ph.url = c.url; });
  }
  /** Bild verkleinern und als JPEG neu kodieren – dabei fallen EXIF-Daten (u. a. GPS-Ort) weg. */
  async function toJpeg(file) {
    if (!file || !/^image\//.test(file.type || 'image/')) throw validationError({ photo: t('validation.photoType') });
    let bitmap;
    try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch { throw validationError({ photo: t('validation.photoType') }); } // z. B. HEIC in Chrome
    if (Math.min(bitmap.width, bitmap.height) < 200) { bitmap.close(); throw validationError({ photo: t('validation.photoSmall') }); }
    const scale = Math.min(1, PHOTO_MAX_PX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob) throw apiError('PHOTO_UPLOAD');
    return blob;
  }
  /** UUID v4 – crypto.randomUUID gibt es nur in sicheren Kontexten (nicht bei npm run dev:lan über http). */
  function uuid() {
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  /* ---------- Laden ---------- */
  /** Eigenes Profil inkl. privater Felder (Geburtsdatum, „Interessiert an“). */
  async function loadMe(id) {
    const [{ data: { session } }, row, ideas, uploads] = await Promise.all([
      supabase.auth.getSession(),
      supabase.from('profiles').select('*').eq('id', id).single().then(unwrap),
      supabase.from('ideas').select('active, deleted_at').eq('owner_id', id).then(unwrap),
      supabase.from('photos').select('id, path, position, status, created_at').eq('owner_id', id).order('position').then(unwrap),
    ]);
    const email = session ? session.user.email : '';
    const live = ideas.filter(i => !i.deleted_at);
    const photoUploads = uploads.map(u => ({ id: u.id, path: u.path, position: u.position, status: u.status, createdAt: ms(u.created_at) }));
    await attachPhotoUrls([photoUploads]);
    return {
      id: row.id, email, name: row.name, birthdate: row.birthdate, gender: row.gender, interestedIn: row.interested_in,
      // photos = Farb-Platzhalter (Ersatz), uploads = echte Fotos mit Prüfstatus (pending/approved/rejected)
      city: row.city, bio: row.bio, photos: row.photos, uploads: photoUploads, interests: row.interests, createdAt: ms(row.created_at),
      profileComplete: row.profile_complete, onboardingStep: row.onboarding_step,
      // Das Onboarding endet mit der ersten eigenen Idee
      firstIdeaCreated: ideas.length > 0,
      age: Util.ageFrom(row.birthdate), ideasCount: live.length, activeIdeasCount: live.filter(i => i.active).length,
    };
  }
  /** Öffentliche Profile als Map id → card (blockierte/unvollständige fehlen). Das eigene ist immer dabei. */
  async function cards(ids) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return new Map();
    const rows = await rpc('get_public_profiles', { ids: unique });
    rows.forEach(r => names.set(r.id, r.name));
    await attachPhotoUrls(rows.map(r => r.photos || []));
    return new Map(rows.map(r => [r.id, r]));
  }
  async function ideasByIds(ids) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return new Map();
    const rows = unwrap(await supabase.from('ideas').select('*').in('id', unique));
    return new Map(rows.map(r => [r.id, r]));
  }
  async function hasActiveIdea(id) {
    const rows = unwrap(await supabase.from('ideas').select('id').eq('owner_id', id).eq('active', true).is('deleted_at', null).limit(1));
    return rows.length > 0;
  }
  async function nameOf(userId) {
    if (!names.has(userId)) await cards([userId]);
    return names.get(userId) || '';
  }
  const otherOf = (m, me) => (m.user1_id === me ? m.user2_id : m.user1_id);
  async function matchPayload(matchId, meId) {
    const m = unwrap(await supabase.from('matches').select('*').eq('id', matchId).single());
    const otherId = otherOf(m, meId);
    const [cs, ideas] = await Promise.all([cards([meId, otherId]), ideasByIds([m.idea_id])]);
    const me = cs.get(meId);
    return { matchId, me: mapPublic(me), other: mapPublic(cs.get(otherId), me), idea: mapIdea(ideas.get(m.idea_id)) };
  }

  /* ---------- Echtzeit ---------- */
  /** Startet die Realtime-Abos für userId. Mehrfachaufrufe (Login + Auth-Listener) teilen sich denselben Start. */
  function startRealtime(userId) {
    if (realtimeUserId === userId && realtimeStart) return realtimeStart;
    stopRealtime();
    realtimeUserId = userId; // sofort setzen, damit parallele Aufrufe nicht doppelt starten
    realtimeStart = (async () => {
      await supabase.realtime.setAuth(); // Token der Sitzung für RLS-geschützte Kanäle
      if (realtimeUserId !== userId) return; // inzwischen abgemeldet/gewechselt
      const safe = fn => payload => fn(payload).catch(e => console.warn('[Realtime]', e));
      dbChannel = supabase.channel('db:' + userId)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'likes', filter: `to_user_id=eq.${userId}` }, safe(onLikeInsert))
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'matches', filter: `user2_id=eq.${userId}` }, safe(onMatchInsert))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, safe(onMessageChange))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'proposals' }, safe(onProposalChange))
        .subscribe();
    })();
    return realtimeStart;
  }
  function stopRealtime() {
    if (dbChannel) supabase.removeChannel(dbChannel);
    matchChannels.forEach(ch => supabase.removeChannel(ch));
    matchChannels.clear();
    dbChannel = null;
    realtimeUserId = null;
    realtimeStart = null;
  }
  async function onLikeInsert({ new: row }) {
    const [cs, ideas] = await Promise.all([cards([row.from_user_id]), ideasByIds([row.idea_id])]);
    const from = cs.get(row.from_user_id);
    if (!from) return;
    emit('request', { likeId: row.id, fromName: from.name, ideaTitle: ideas.has(row.idea_id) ? ideas.get(row.idea_id).title : '' });
    changed('request');
  }
  async function onMatchInsert({ new: row }) {
    // Meine Anfrage wurde angenommen (user2 = Person, die gelikt hat)
    emit('match', await matchPayload(row.id, realtimeUserId));
    changed('match');
  }
  async function onMessageChange({ eventType, new: row }) {
    if (eventType === 'INSERT' && row.sender_id !== realtimeUserId) {
      clearTyping(row.match_id, row.sender_id);
      if (!row.from_like) emit('message', { matchId: row.match_id, message: mapMessage(row), senderName: await nameOf(row.sender_id) });
    }
    if (eventType === 'UPDATE' && row.sender_id === realtimeUserId && row.read_at) emit('read', { matchId: row.match_id });
    changed('message');
  }
  async function onProposalChange({ eventType, new: row }) {
    if (eventType === 'UPDATE' && row.proposed_by === realtimeUserId && row.status !== 'proposed') {
      const m = unwrap(await supabase.from('matches').select('user1_id, user2_id').eq('id', row.match_id).single());
      emit('proposal', { matchId: row.match_id, proposal: mapProposal(row), byName: await nameOf(otherOf(m, realtimeUserId)) });
    }
    // Neuer Vorschlag der anderen Person: offene Ansicht neu laden („sync“ = Daten haben sich von außen geändert)
    if (eventType === 'INSERT' && row.proposed_by !== realtimeUserId) emit('sync', {});
    changed('proposal');
  }

  /* „schreibt …“: privater Broadcast-Kanal pro Match (nur Beteiligte, siehe Migration chat.sql) */
  function matchChannel(matchId) {
    if (matchChannels.has(matchId)) return matchChannels.get(matchId);
    const ch = supabase.channel('match:' + matchId, { config: { private: true, broadcast: { self: false } } })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload && payload.userId && payload.userId !== realtimeUserId) setTyping(matchId, payload.userId);
      })
      .subscribe();
    matchChannels.set(matchId, ch);
    return ch;
  }
  function setTyping(matchId, userId) {
    typing[matchId] = userId;
    emit('typing', { matchId, userId, typing: true });
    clearTimeout(typingTimers[matchId]);
    typingTimers[matchId] = setTimeout(() => clearTyping(matchId, userId), TYPING_MS);
  }
  function clearTyping(matchId, userId) {
    if (typing[matchId] !== userId) return;
    delete typing[matchId];
    clearTimeout(typingTimers[matchId]);
    emit('typing', { matchId, userId, typing: false });
  }

  /* ---------- Sitzung ---------- */
  function onAuthChange(event, session) {
    const id = session ? session.user.id : null;
    // Nie direkt im Callback weitere Supabase-Aufrufe starten (Deadlock-Gefahr) – daher setTimeout
    setTimeout(() => {
      if (id) startRealtime(id).catch(e => console.warn('[Realtime]', e));
      else stopRealtime();
      if (event === 'INITIAL_SESSION' || id === knownUserId) return;
      // Sitzung hat sich woanders geändert (anderer Tab, abgelaufen) – die App lädt den Stand neu
      knownUserId = id;
      emit('session', { external: true });
    }, 0);
  }
  async function signedIn(session) {
    // Sofort merken: sonst hält der Auth-Listener die eigene Anmeldung für einen Wechsel in einem
    // anderen Tab und die App springt ein zweites Mal zur Startseite
    knownUserId = session.user.id;
    const user = await loadMe(session.user.id);
    await startRealtime(user.id);
    emit('session', { userId: user.id, user });
    return user;
  }

  /* ===========================================================================
     ÖFFENTLICHE API
     =========================================================================== */
  const api = {
    on,
    init() {
      if (ready) return ready;
      ready = (async () => {
        if (!supabase) throw apiError('NOT_CONFIGURED');
        // Link aus „Passwort vergessen“? Muss VOR getSession() erkannt werden – Supabase entfernt den Hash danach.
        recoveryPending = /[#&]type=recovery\b/.test(location.hash);
        // getSession() verarbeitet auch den Bestätigungslink aus der Adresszeile (#access_token=…)
        const { data } = await supabase.auth.getSession();
        knownUserId = data.session ? data.session.user.id : null;
        if (knownUserId) await startRealtime(knownUserId).catch(e => console.warn('[Realtime]', e));
        supabase.auth.onAuthStateChange(onAuthChange);
      })();
      return ready;
    },
    get pendingRequests() { return pending; },
    /** true (einmalig), wenn die App über einen „Passwort vergessen“-Link geöffnet wurde. */
    consumePasswordRecovery() { const r = recoveryPending; recoveryPending = false; return r; },

    /* ----- Auth ----- */
    register({ email, password, passwordRepeat }) {
      return request('auth.signUp', async () => {
        const em = validateCredentials({ email, password, passwordRepeat });
        setRememberSession(true);
        const { data, error } = await supabase.auth.signUp({ email: em, password, options: { emailRedirectTo: location.origin + location.pathname } });
        if (error) throw error;
        // Mit E-Mail-Bestätigung gibt es noch keine Sitzung. (Auch bei bereits registrierter
        // Adresse kommt diese Antwort – so verrät die App nicht, wer schon ein Konto hat.)
        if (!data.session) return { needsConfirmation: true, email: em };
        return signedIn(data.session);
      });
    },
    login({ email, password, remember }) {
      return request('auth.signIn', async () => {
        const em = String(email || '').trim().toLowerCase();
        if (!em || !password) throw apiError('INVALID_CREDENTIALS');
        setRememberSession(!!remember);
        const { data, error } = await supabase.auth.signInWithPassword({ email: em, password });
        if (error) throw error;
        return signedIn(data.session);
      });
    },
    /** Link zum Zurücksetzen per Mail anfordern. Antwortet immer gleich – verrät nicht, ob es das Konto gibt. */
    requestPasswordReset(email) {
      return request('auth.resetPassword', async () => {
        const em = String(email || '').trim().toLowerCase();
        if (!Util.isValidEmail(em)) throw validationError({ email: t('validation.email') });
        const { error } = await supabase.auth.resetPasswordForEmail(em, { redirectTo: location.origin + location.pathname });
        if (error) throw error;
        return true;
      });
    },
    /** Neues Passwort setzen (nach dem Mail-Link oder im Profil). */
    updatePassword({ password, passwordRepeat }) {
      return request('auth.updateUser', async () => {
        const f = {};
        if (String(password || '').length < 8) f.password = t('validation.passwordMin');
        if (password !== passwordRepeat) f.passwordRepeat = t('validation.passwordMismatch');
        if (Object.keys(f).length) throw validationError(f);
        const { error } = await supabase.auth.updateUser({ password });
        if (error && error.code === 'same_password') throw validationError({ password: t('validation.samePassword') });
        if (error) throw error;
        return true;
      });
    },
    logout() {
      return request('auth.signOut', async () => {
        knownUserId = null;
        stopRealtime();
        await supabase.auth.signOut({ scope: 'local' }); // nur dieses Gerät abmelden
        emit('session', { userId: null });
        return true;
      });
    },
    getCurrentUser() {
      return request('profiles.me', async () => {
        const { data } = await supabase.auth.getSession();
        return data.session ? loadMe(data.session.user.id) : null;
      });
    },
    updateProfile(patch) {
      return request('profiles.update', async () => {
        const clean = validateProfilePatch(patch || {});
        const id = await myId();
        const columns = { interestedIn: 'interested_in', onboardingStep: 'onboarding_step' };
        const row = Object.fromEntries(Object.entries(clean).map(([k, v]) => [columns[k] || k, v]));
        unwrap(await supabase.from('profiles').update(row).eq('id', id));
        const user = await loadMe(id);
        changed('profile');
        return user;
      });
    },
    /** Echtes Foto hochladen (wird verkleinert). Es bleibt für andere unsichtbar, bis die Moderation es freigibt. */
    uploadPhoto(file) {
      return request('photos.upload', async () => {
        const id = await myId();
        const existing = unwrap(await supabase.from('photos').select('position').eq('owner_id', id));
        if (existing.length >= 3) throw apiError('PHOTO_LIMIT');
        const blob = await toJpeg(file);
        const path = `${id}/${uuid()}.jpg`;
        const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
        if (uploadError) throw uploadError;
        const position = [0, 1, 2].find(p => !existing.some(e => e.position === p));
        const { error } = await supabase.from('photos').insert({ owner_id: id, path, position });
        if (error) {
          await supabase.storage.from(PHOTO_BUCKET).remove([path]).catch(() => {}); // Datei nicht verwaist liegen lassen
          throw error;
        }
        const user = await loadMe(id);
        changed('profile');
        return user;
      });
    },
    /** Echtes Foto löschen: erst die Datei (geht nur über die Storage-API), dann den Eintrag. */
    deletePhoto(photoId) {
      return request('photos.delete', async () => {
        const id = await myId();
        const row = unwrap(await supabase.from('photos').select('path').eq('id', photoId).eq('owner_id', id).maybeSingle());
        if (!row) throw apiError('NOT_FOUND');
        const { error } = await supabase.storage.from(PHOTO_BUCKET).remove([row.path]);
        if (error) throw error;
        unwrap(await supabase.from('photos').delete().eq('id', photoId));
        photoUrls.delete(row.path);
        const user = await loadMe(id);
        changed('profile');
        return user;
      });
    },
    completeOnboarding() {
      return request('rpc.complete_onboarding', async () => {
        await rpc('complete_onboarding');
        const user = await loadMe(await myId());
        changed('profile');
        return user;
      });
    },

    /* ----- Feed & Likes ----- */
    getFeed(filters = {}) {
      return request('rpc.get_feed', async () => {
        const id = await myId();
        const [active, rows, cs] = await Promise.all([hasActiveIdea(id), rpc('get_feed'), cards([id])]);
        if (!active) return { locked: true, items: [], totalBeforeFilter: 0 };
        await attachPhotoUrls(rows.map(r => r.owner.photos || []));
        const me = cs.get(id);
        const items = rows.map(r => {
          const owner = mapPublic(r.owner, me);
          return { idea: mapIdea(r.idea), owner, distanceKm: owner.distanceKm };
        });
        return { locked: false, items: filterAndSortFeed(items, filters, id), totalBeforeFilter: items.length };
      });
    },
    likeIdea(ideaId, message = '') {
      return request('rpc.like_idea', async () => {
        const like = await rpc('like_idea', { p_idea_id: ideaId, p_message: message || null });
        changed('like');
        return mapLike(like);
      });
    },
    passIdea(ideaId) {
      return request('passes.insert', async () => {
        const { error } = await supabase.from('passes').insert({ user_id: await myId(), idea_id: ideaId });
        if (error && error.code !== '23505') throw error; // schon übersprungen → egal
        return true;
      });
    },
    resetPasses() {
      return request('passes.delete', async () => {
        const { count, error } = await supabase.from('passes').delete({ count: 'exact' }).eq('user_id', await myId());
        if (error) throw error;
        changed('passes');
        return count || 0;
      });
    },
    getRequests() {
      return request('likes.received', async () => {
        const id = await myId();
        const likes = unwrap(await supabase.from('likes').select('*').eq('to_user_id', id).eq('status', 'pending').order('created_at', { ascending: false }));
        const [cs, ideas] = await Promise.all([cards([id, ...likes.map(l => l.from_user_id)]), ideasByIds(likes.map(l => l.idea_id))]);
        const me = cs.get(id);
        return likes.filter(l => cs.has(l.from_user_id)).map(l => ({
          id: l.id, createdAt: ms(l.created_at), message: l.message, from: mapPublic(cs.get(l.from_user_id), me), idea: mapIdea(ideas.get(l.idea_id)),
        }));
      });
    },
    getSentLikes() {
      return request('rpc.get_sent_likes', async () => {
        const id = await myId();
        const [rows, cs] = await Promise.all([rpc('get_sent_likes'), cards([id])]);
        await attachPhotoUrls(rows.map(r => (r.owner && r.owner.photos) || []));
        const me = cs.get(id);
        return rows.filter(r => r.owner).map(r => ({
          id: r.like_id, createdAt: ms(r.created_at), message: r.message, status: r.status, matchId: r.match_id,
          idea: mapIdea(r.idea), ideaUnavailable: !r.idea || !!r.idea.deleted_at, owner: mapPublic(r.owner, me),
        }));
      });
    },
    respondToLike(likeId, accept) {
      return request('rpc.respond_to_like', async () => {
        const res = await rpc('respond_to_like', { p_like_id: likeId, p_accept: !!accept });
        changed('like-response');
        if (!res.accepted) return { accepted: false };
        return { accepted: true, ...(await matchPayload(res.matchId, await myId())) };
      });
    },

    /* ----- Matches & Chat ----- */
    getMatches() {
      return request('rpc.get_match_summaries', async () => {
        const id = await myId();
        const rows = await rpc('get_match_summaries');
        const [cs, ideas] = await Promise.all([cards([id, ...rows.map(r => r.other_id)]), ideasByIds(rows.map(r => r.idea_id))]);
        const me = cs.get(id);
        return rows.filter(r => cs.has(r.other_id)).map(r => {
          const other = mapPublic(cs.get(r.other_id), me);
          const timeline = [];
          if (r.last_message) timeline.push({ kind: 'message', at: ms(r.last_message.created_at), text: r.last_message.text, senderId: r.last_message.sender_id });
          if (r.last_proposal) {
            const p = mapProposal(r.last_proposal);
            timeline.push({ kind: 'proposal', at: p.respondedAt || p.createdAt, text: proposalPreview(p, id, other.name), senderId: p.proposedBy });
          }
          const last = timeline.sort((a, b) => b.at - a.at)[0] || null;
          return {
            id: r.id, createdAt: ms(r.created_at), other, idea: mapIdea(ideas.get(r.idea_id)),
            last, hasMessages: r.message_count > 0, unread: r.unread, pendingProposal: r.pending_proposal,
            isNew: !r.seen, typing: typing[r.id] === r.other_id,
            nextDate: r.next_date ? new Date(r.next_date).toISOString() : null,
            lastActivity: last ? last.at : ms(r.created_at),
          };
        }).sort((a, b) => b.lastActivity - a.lastActivity);
      });
    },
    getMessages(matchId) {
      return request('messages.list', async () => {
        if (!isUuid(matchId)) throw apiError('NOT_FOUND');
        const id = await myId();
        const m = unwrap(await supabase.from('matches').select('*').eq('id', matchId).maybeSingle());
        if (!m) throw apiError('NOT_FOUND');
        const otherId = otherOf(m, id);
        const [msgs, props, cs, ideas] = await Promise.all([
          supabase.from('messages').select('*').eq('match_id', matchId).order('created_at').then(unwrap),
          supabase.from('proposals').select('*').eq('match_id', matchId).then(unwrap),
          cards([id, otherId]),
          ideasByIds([m.idea_id]),
        ]);
        if (!cs.has(otherId)) throw apiError('NOT_FOUND');
        matchChannel(matchId); // ab jetzt „schreibt …“ empfangen
        const me = cs.get(id);
        const items = [
          ...msgs.map(x => ({ kind: 'message', ...mapMessage(x) })),
          ...props.map(p => ({ kind: 'proposal', ...mapProposal(p) })),
        ].sort((a, b) => a.createdAt - b.createdAt);
        return { match: { id: m.id, createdAt: ms(m.created_at), ideaId: m.idea_id }, me: mapPublic(me), other: mapPublic(cs.get(otherId), me),
          idea: mapIdea(ideas.get(m.idea_id)), items, typing: typing[m.id] === otherId };
      });
    },
    markAsRead(matchId) {
      return request('rpc.mark_as_read', async () => {
        if (await rpc('mark_as_read', { p_match_id: matchId })) changed('read');
        return true;
      });
    },
    sendMessage(matchId, text) {
      return request('messages.insert', async () => {
        const msg = validateMessage(text);
        const row = unwrap(await supabase.from('messages').insert({ match_id: matchId, sender_id: await myId(), text: msg }).select().single());
        lastTypingSent[matchId] = 0;
        changed('message');
        return mapMessage(row);
      });
    },
    /** „schreibt …“ an die andere Person senden (gedrosselt). Wirft nie – ist nur ein Hinweis. */
    sendTyping(matchId) {
      if (!supabase || !realtimeUserId || !isUuid(matchId)) return;
      if (Date.now() - (lastTypingSent[matchId] || 0) < TYPING_THROTTLE_MS) return;
      lastTypingSent[matchId] = Date.now();
      matchChannel(matchId).send({ type: 'broadcast', event: 'typing', payload: { userId: realtimeUserId } })
        .catch(e => console.warn('[Realtime] typing', e));
    },
    proposeDate(matchId, dateTime) {
      return request('proposals.insert', async () => {
        const d = validateProposalDate(dateTime);
        const row = unwrap(await supabase.from('proposals').insert({ match_id: matchId, proposed_by: await myId(), date_time: d.toISOString() }).select().single());
        changed('proposal');
        return mapProposal(row);
      });
    },
    respondToProposal(proposalId, accept) {
      return request('rpc.respond_to_proposal', async () => {
        const row = await rpc('respond_to_proposal', { p_proposal_id: proposalId, p_accept: !!accept });
        changed('proposal');
        return mapProposal(row);
      });
    },
    getMyDates() {
      return request('proposals.mine', async () => {
        const id = await myId();
        const [props, matches] = await Promise.all([
          supabase.from('proposals').select('*').then(unwrap),
          supabase.from('matches').select('*').then(unwrap),
        ]);
        const byId = new Map(matches.map(m => [m.id, m]));
        const [cs, ideas] = await Promise.all([cards([id, ...matches.map(m => otherOf(m, id))]), ideasByIds(matches.map(m => m.idea_id))]);
        const me = cs.get(id);
        const list = props.filter(p => byId.has(p.match_id) && cs.has(otherOf(byId.get(p.match_id), id))).map(p => {
          const m = byId.get(p.match_id);
          const proposal = mapProposal(p);
          return { proposal, matchId: m.id, other: mapPublic(cs.get(otherOf(m, id)), me), idea: mapIdea(ideas.get(m.idea_id)), mine: proposal.proposedBy === id };
        });
        const now = Date.now();
        const at = x => new Date(x.proposal.dateTime).getTime();
        return {
          upcoming: list.filter(x => x.proposal.status === 'confirmed' && at(x) >= now - 3 * HOUR).sort((a, b) => at(a) - at(b)),
          pending: list.filter(x => x.proposal.status === 'proposed' && at(x) > now).sort((a, b) => at(a) - at(b)),
          past: list.filter(x => x.proposal.status === 'confirmed' && at(x) < now - 3 * HOUR).sort((a, b) => at(b) - at(a)),
        };
      });
    },

    /* ----- Eigene Ideen ----- */
    getMyIdeas() {
      return request('ideas.mine', async () => {
        const id = await myId();
        const [ideas, likes, matches] = await Promise.all([
          supabase.from('ideas').select('*').eq('owner_id', id).is('deleted_at', null).then(unwrap),
          supabase.from('likes').select('idea_id').eq('to_user_id', id).eq('status', 'pending').then(unwrap),
          supabase.from('matches').select('idea_id').then(unwrap),
        ]);
        const count = (list, ideaId) => list.filter(x => x.idea_id === ideaId).length;
        return ideas.map(i => ({ ...mapIdea(i), pendingLikes: count(likes, i.id), matchCount: count(matches, i.id) }))
          .sort((a, b) => (b.active - a.active) || (b.createdAt - a.createdAt));
      });
    },
    getIdea(ideaId) {
      return request('ideas.get', async () => {
        if (!isUuid(ideaId)) throw apiError('NOT_FOUND');
        const id = await myId();
        const row = unwrap(await supabase.from('ideas').select('*').eq('id', ideaId).is('deleted_at', null).maybeSingle());
        if (!row) throw apiError('NOT_FOUND');
        if (row.owner_id !== id) throw apiError('FORBIDDEN');
        return mapIdea(row);
      });
    },
    createIdea(data) {
      return request('ideas.insert', async () => {
        const c = validateIdea(data || {});
        const row = unwrap(await supabase.from('ideas').insert({
          owner_id: await myId(), emoji: c.emoji, title: c.title, description: c.description, category: c.category,
          budget: c.budget, duration: c.duration, time_of_day: c.timeOfDay, location: c.location,
        }).select().single());
        changed('idea');
        return mapIdea(row);
      });
    },
    updateIdea(ideaId, data) {
      return request('ideas.update', async () => {
        const c = validateIdea(data || {});
        const rows = unwrap(await supabase.from('ideas').update({
          emoji: c.emoji, title: c.title, description: c.description, category: c.category,
          budget: c.budget, duration: c.duration, time_of_day: c.timeOfDay, location: c.location,
        }).eq('id', ideaId).is('deleted_at', null).select());
        if (!rows.length) throw apiError('FORBIDDEN');
        changed('idea');
        return mapIdea(rows[0]);
      });
    },
    setIdeaActive(ideaId, active) {
      return request('ideas.setActive', async () => {
        const rows = unwrap(await supabase.from('ideas').update({ active: !!active }).eq('id', ideaId).is('deleted_at', null).select());
        if (!rows.length) throw apiError('FORBIDDEN');
        changed('idea');
        return mapIdea(rows[0]);
      });
    },
    deleteIdea(ideaId) {
      return request('rpc.delete_idea', async () => {
        await rpc('delete_idea', { p_idea_id: ideaId });
        changed('idea');
        return true;
      });
    },

    /* ----- Profile anderer ----- */
    getUserProfile(userId) {
      return request('profiles.public', async () => {
        if (!isUuid(userId)) throw apiError('NOT_FOUND');
        const id = await myId();
        const isMe = userId === id;
        const [cs, ideas, sent, canLike, matches, incoming] = await Promise.all([
          cards([id, userId]),
          supabase.from('ideas').select('*').eq('owner_id', userId).is('deleted_at', null).order('created_at', { ascending: false }).then(unwrap),
          isMe ? [] : rpc('get_sent_likes'),
          isMe ? false : hasActiveIdea(id),
          isMe ? [] : supabase.from('matches').select('id, user1_id, user2_id').or(`user1_id.eq.${userId},user2_id.eq.${userId}`).then(unwrap),
          isMe ? [] : supabase.from('likes').select('*').eq('from_user_id', userId).eq('to_user_id', id).eq('status', 'pending').then(unwrap),
        ]);
        const card = cs.get(userId);
        if (!card) throw apiError('NOT_FOUND');
        const me = cs.get(id);
        const liked = new Set(sent.map(s => s.idea && s.idea.id));
        const incomingIdeas = await ideasByIds(incoming.map(l => l.idea_id));
        return {
          user: mapPublic(card, me), isMe, compatible: isMe || card.compatible, matchId: matches.length ? matches[0].id : null, canLike,
          incoming: incoming.map(l => ({ id: l.id, message: l.message, createdAt: ms(l.created_at), idea: mapIdea(incomingIdeas.get(l.idea_id)) })),
          ideas: ideas.filter(i => isMe || i.active).map(i => ({ idea: mapIdea(i), liked: liked.has(i.id) })),
        };
      });
    },
    getBadges() {
      return request('badges', async () => {
        const id = await myId();
        const [{ count, error }, rows] = await Promise.all([
          supabase.from('likes').select('id', { count: 'exact', head: true }).eq('to_user_id', id).eq('status', 'pending'),
          rpc('get_match_summaries'),
        ]);
        if (error) throw error;
        return { requests: count || 0, chats: rows.filter(r => !r.seen || r.unread > 0 || r.pending_proposal).length };
      });
    },

    /* ----- Sicherheit: Blockieren ----- */
    /** Blockiert eine Person: Profil, Ideen, Match und Chat verschwinden für beide (Daten bleiben erhalten). */
    blockUser(userId) {
      return request('blocks.insert', async () => {
        if (!isUuid(userId)) throw apiError('NOT_FOUND');
        const { error } = await supabase.from('blocks').insert({ blocker_id: await myId(), blocked_id: userId });
        if (error && error.code !== '23505') throw error; // schon blockiert → egal
        changed('block');
        return true;
      });
    },
    unblockUser(userId) {
      return request('blocks.delete', async () => {
        unwrap(await supabase.from('blocks').delete().eq('blocker_id', await myId()).eq('blocked_id', userId));
        changed('block');
        return true;
      });
    },
    /** Person melden (Grund: fake, inappropriate, harassment, spam, scam, underage, other) – blockiert standardmäßig mit. */
    reportUser({ userId, reason, details = '', ideaId = null, matchId = null, block = true }) {
      return request('rpc.report_user', async () => {
        if (!reason) throw validationError({ reason: t('safety.reasonMissing') });
        await rpc('report_user', { p_user_id: userId, p_reason: reason, p_details: details || null, p_idea_id: ideaId, p_match_id: matchId, p_block: !!block });
        if (block) changed('block');
        return true;
      });
    },
    getBlockedUsers() {
      return request('rpc.get_blocked_users', async () => {
        const rows = await rpc('get_blocked_users');
        return rows.map(r => ({ id: r.id, name: r.name, photos: r.photo ? [r.photo] : [], blockedAt: ms(r.blocked_at) }));
      });
    },

    /* ----- Konto & Datenschutz (DSGVO) ----- */
    /** Eigene Daten als Objekt (für den Download als JSON-Datei). */
    exportMyData() {
      return request('rpc.export_my_data', async () => {
        const [data, photos] = await Promise.all([rpc('export_my_data'), rpc('export_my_photos')]);
        // Fotos als Links zum Herunterladen (24 Std. gültig)
        if (photos.length) {
          const { data: signed, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(photos.map(p => p.path), 86400);
          if (error) throw error;
          const until = new Date(Date.now() + 86400000).toISOString();
          photos.forEach(p => {
            const s = signed.find(x => x.path === p.path);
            if (s && s.signedUrl) Object.assign(p, { downloadUrl: s.signedUrl, downloadUrlValidUntil: until });
          });
        }
        return { ...data, photos };
      });
    },
    /** Konto und alle Daten endgültig löschen. Das Passwort wird vorher erneut geprüft. */
    deleteAccount(password) {
      return request('rpc.delete_my_account', async () => {
        const { data } = await supabase.auth.getSession();
        const email = data.session && data.session.user.email;
        if (!email) throw apiError('UNAUTHORIZED');
        if (!password) throw validationError({ password: t('validation.passwordMissing') });
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          if (error.code === 'invalid_credentials') throw validationError({ password: t('errors.INVALID_CREDENTIALS') });
          throw error;
        }
        // Fotos zuerst: Dateien lassen sich nur über die Storage-API löschen, nicht von der Datenbank aus
        const uid = data.session.user.id;
        const { data: files, error: listError } = await supabase.storage.from(PHOTO_BUCKET).list(uid, { limit: 100 });
        if (listError) throw listError;
        if (files.length) {
          const { error: removeError } = await supabase.storage.from(PHOTO_BUCKET).remove(files.map(f => `${uid}/${f.name}`));
          if (removeError) throw removeError;
        }
        await rpc('delete_my_account');
        knownUserId = null;
        stopRealtime();
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {}); // Konto ist weg – nur noch lokal aufräumen
        emit('session', { userId: null });
        return true;
      });
    },

    /* ----- Entwickler-Funktionen (nur mit npm run dev; im Produktionsbuild null) ----- */
    dev: import.meta.env.DEV ? {
      /** Login-Testkonten aus dem Seed (npm run db:seed) – mit den UUIDs, die das Seed-Skript vergibt. */
      testAccounts() {
        return TEST_ACCOUNTS.map(a => ({ ...a, id: seedUuid(a.id), name: (SEED_PEOPLE.find(p => p.id === a.id) || {}).name || a.email }));
      },
      /** Als Testkonto anmelden (mit dem bekannten Test-Passwort). */
      switchUser(userId) {
        const account = api.dev.testAccounts().find(a => a.id === userId);
        if (!account) return Promise.reject(apiError('NOT_FOUND'));
        return api.login({ email: account.email, password: account.password, remember: true });
      },
      checkSupabase: checkSupabaseHealth,
    } : null,
  };
  return api;
})();

export { DataService };
