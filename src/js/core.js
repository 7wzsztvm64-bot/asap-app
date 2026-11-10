import { t, tOr, getLang } from '../i18n/index.js';

/* =============================================================================
   asap – Grundbausteine: Hilfsfunktionen, HTML-Templating, Formatierung (je Sprache),
   Icons, fachliche Konstanten mit Anzeigenamen (Label) und Storage-Adapter.
   ============================================================================= */

/* =============================================================================
   1) HILFSFUNKTIONEN
   ============================================================================= */
const Util = {
  uid(prefix = 'id') {
    return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  },
  sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); },
  randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; },
  pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },
  /** Deterministischer 32-Bit-Hash (FNV-1a) – für stabile Pseudo-Zufallswerte. */
  hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  },
  clamp(v, min, max) { return Math.min(max, Math.max(min, v)); },
  debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  },
  ageFrom(birthdate) {
    if (!birthdate) return null;
    const b = new Date(birthdate + 'T12:00:00');
    if (isNaN(b)) return null;
    const now = new Date();
    let age = now.getFullYear() - b.getFullYear();
    const m = now.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
    return age;
  },
  initials(name) {
    const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  },
  isoDate(d) {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  },
  sameDay(a, b) {
    a = new Date(a); b = new Date(b);
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  },
  isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || '').trim()); },
};

/* ---------- Sicheres HTML-Templating (verhindert XSS bei Nutzereingaben) ---------- */
class SafeHtml {
  constructor(str) { this.str = str; }
  toString() { return this.str; }
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function raw(str) { return new SafeHtml(String(str)); }
function renderValue(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof SafeHtml) return v.str;
  if (Array.isArray(v)) return v.map(renderValue).join('');
  return escapeHtml(v);
}
/** Tagged Template: alle Interpolationen werden escaped, außer raw()/html``-Ergebnisse. */
function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += renderValue(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

/* ---------- Formatierung (folgt der gewählten Sprache) ---------- */
const Fmt = (() => {
  const cache = {};
  /** Intl-Formatierer der aktuellen Sprache (einmal pro Sprache erzeugt). */
  function f() {
    const lang = getLang();
    if (cache[lang]) return cache[lang];
    const loc = lang === 'en' ? 'en-GB' : 'de-DE';
    return (cache[lang] = {
      time: new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit' }),
      wdShort: new Intl.DateTimeFormat(loc, { weekday: 'short' }),
      wdLong: new Intl.DateTimeFormat(loc, { weekday: 'long' }),
      dayMonthLong: new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'long' }),
      dayMonthNum: new Intl.DateTimeFormat(loc, { day: '2-digit', month: '2-digit' }),
      monthShort: new Intl.DateTimeFormat(loc, { month: 'short' }),
      num1: new Intl.NumberFormat(loc, { maximumFractionDigits: 1, minimumFractionDigits: 0 }),
    });
  }
  const DAY = 86400000;
  const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
  const dayDiff = ts => Math.round((startOfDay(Date.now()) - startOfDay(ts)) / DAY);
  const stripDot = s => s.replace(/\.$/, '');
  // Deutsch: „10.10.“ (genau ein Punkt), Englisch: „10/10“
  const dm = d => (getLang() === 'de' ? f().dayMonthNum.format(d).replace(/\.?$/, '.') : f().dayMonthNum.format(d));
  const time = d => f().time.format(d);
  return {
    time: ts => time(new Date(ts)),
    chatListTime(ts) {
      const diff = dayDiff(ts);
      if (diff <= 0) return time(new Date(ts));
      if (diff === 1) return t('fmt.yesterday');
      if (diff < 7) return stripDot(f().wdShort.format(new Date(ts))) + (getLang() === 'de' ? '.' : '');
      return dm(new Date(ts));
    },
    dayLabel(ts) {
      const diff = dayDiff(ts);
      if (diff === 0) return t('fmt.today');
      if (diff === 1) return t('fmt.yesterday');
      return f().wdLong.format(new Date(ts)) + ', ' + f().dayMonthLong.format(new Date(ts));
    },
    relative(ts) {
      const s = Math.round((Date.now() - ts) / 1000);
      if (s < 60) return t('fmt.justNow');
      const m = Math.round(s / 60);
      if (m < 60) return t('fmt.minutesAgo', { n: m });
      const h = Math.round(m / 60);
      if (h < 24) return t('fmt.hoursAgo', { n: h });
      const d = dayDiff(ts);
      if (d === 1) return t('fmt.yesterdayLower');
      if (d < 7) return t('fmt.daysAgo', { n: d });
      return dm(new Date(ts));
    },
    dateTimeLong(iso) {
      const d = new Date(iso);
      return t('fmt.dateTimeLong', { weekday: f().wdLong.format(d), date: f().dayMonthLong.format(d), time: time(d) });
    },
    dateShort(iso) {
      const d = new Date(iso);
      return `${stripDot(f().wdShort.format(d))}, ${dm(d)} · ${time(d)}`;
    },
    weekdayShort: iso => stripDot(f().wdShort.format(new Date(iso))),
    weekdayLong: iso => f().wdLong.format(new Date(iso)),
    monthShort: iso => stripDot(f().monthShort.format(new Date(iso))),
    dayNum: iso => new Date(iso).getDate(),
    km: n => f().num1.format(n) + ' km',
    countdown(iso) {
      const ms = new Date(iso).getTime() - Date.now();
      if (ms < 0) return t('fmt.past');
      const days = -dayDiff(new Date(iso).getTime());
      if (days === 0) return t('fmt.inHours', { n: Math.max(1, Math.round(ms / 3600000)) });
      if (days === 1) return t('fmt.tomorrow');
      return t('fmt.inDays', { n: days });
    },
  };
})();

/* ---------- Icons (Inline-SVG, offlinefähig) ---------- */
const ICONS = {
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2.1 4.9-4.9 2.1 2.1-4.9z"/>',
  heart: '<path d="M12 20.3s-7.5-4.6-7.5-10.4A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.7c0 5.8-7.5 10.4-7.5 10.4z"/>',
  heartFill: '<path fill="currentColor" stroke="none" d="M12 21.2c-.3 0-.6-.1-.8-.2C10.8 20.7 3 15.9 3 9.9a4.9 4.9 0 0 1 9-2.7 4.9 4.9 0 0 1 9 2.7c0 6-7.8 10.8-8.2 11.1-.2.1-.5.2-.8.2z"/>',
  chat: '<path d="M20.5 11.6a8.1 8.1 0 0 1-11.8 7.2L4 20l1.3-4.4A8.1 8.1 0 1 1 20.5 11.6z"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  calendarPlus: '<rect x="3.5" y="5" width="17" height="15.5" rx="3.5"/><path d="M3.5 10h17M8 3v4M16 3v4M12 12.8v5M9.5 15.3h5"/>',
  user: '<circle cx="12" cy="8.3" r="3.8"/><path d="M4.6 20.2a7.4 7.4 0 0 1 14.8 0"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chevronRight: '<path d="M9 5l7 7-7 7"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  send: '<path d="M21 3 10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5z"/>',
  filter: '<path d="M4 7h9M18 7h2M4 17h4M13 17h7"/><circle cx="15.5" cy="7" r="2.3"/><circle cx="10.5" cy="17" r="2.3"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  pause: '<rect x="6.5" y="5" width="3.5" height="14" rx="1"/><rect x="14" y="5" width="3.5" height="14" rx="1"/>',
  play: '<path d="M7.5 5.5v13l11-6.5z"/>',
  trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.8M6.6 6.6C4 8.3 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.7 0 3.2-.5 4.5-1.2M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  logout: '<path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H15M10 16l-4-4 4-4M6 12h10"/>',
  sparkle: '<path d="M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8z"/><path d="M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
  nav: '<path d="M4 11.5 20 4l-7.5 16-2-6.5z"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.6-4.5M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5M20 20v-4h-4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  swap: '<path d="M7 7h13l-3.5-3.5M17 17H4l3.5 3.5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  bolt: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>',
};
function icon(name, size = 22, sw = 2) {
  return raw(`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`);
}
let __logoSeq = 0;
function logoMark() {
  const id = 'lgm' + (++__logoSeq);
  return raw(`<svg class="mark" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF8456"/><stop offset="1" stop-color="#E23E2A"/></linearGradient></defs><path fill="url(#${id})" d="M12 2C7.6 2 4 5.5 4 9.9c0 5.6 6.6 11.4 7.3 12a1 1 0 0 0 1.4 0c.7-.6 7.3-6.4 7.3-12C20 5.5 16.4 2 12 2z"/><path fill="#fff" d="M12 13.4l-.6-.5C9.4 11.2 8.2 10.1 8.2 8.8c0-1 .8-1.8 1.8-1.8.6 0 1.2.3 1.6.7l.4.4.4-.4c.4-.4 1-.7 1.6-.7 1 0 1.8.8 1.8 1.8 0 1.3-1.2 2.4-3.2 4.1l-.6.5z"/></svg>`);
}
function logo(cls = '') {
  return html`<span class="logo ${cls}">${logoMark()}<span class="word">asap<i>.</i></span></span>`;
}

/* ---------- Fachliche Konstanten ----------
   Gespeichert wird immer der deutsche Wert (label/value) – er ist der Schlüssel in der Datenbank.
   Angezeigt wird der übersetzte Name (name/label-Getter bzw. Label.*). */
const CATEGORIES = [
  { label: 'Essen & Trinken', key: 'food',      emoji: '🍽️', from: '#FF6B4A', to: '#FFB25B' },
  { label: 'Outdoor',         key: 'outdoor',   emoji: '🌿', from: '#2E9E6B', to: '#9BD770' },
  { label: 'Kultur',          key: 'culture',   emoji: '🎭', from: '#6A4BD8', to: '#C77DDE' },
  { label: 'Sport',           key: 'sport',     emoji: '🏸', from: '#1F7AE0', to: '#5CC8F0' },
  { label: 'Abenteuer',       key: 'adventure', emoji: '🧗', from: '#E2335B', to: '#FF8A5B' },
  { label: 'Entspannt',       key: 'relaxed',   emoji: '🧺', from: '#14A3A3', to: '#8EDDC9' },
].map(c => ({ ...c, get name() { return t('values.category.' + c.key); } }));
const CAT = Object.fromEntries(CATEGORIES.map(c => [c.label, c]));
const BUDGETS = [
  { value: '€',   key: 'low' },
  { value: '€€',  key: 'mid' },
  { value: '€€€', key: 'high' },
].map(b => ({ ...b, get label() { return t('values.budget.' + b.key); }, get hint() { return t('values.budgetHint.' + b.key); } }));
const TIMES = [
  { value: 'Morgens',     key: 'morning',   emoji: '🌅', defaultHour: '10:00' },
  { value: 'Mittags',     key: 'midday',    emoji: '☀️', defaultHour: '12:30' },
  { value: 'Nachmittags', key: 'afternoon', emoji: '🌤️', defaultHour: '15:00' },
  { value: 'Abends',      key: 'evening',   emoji: '🌙', defaultHour: '19:00' },
  { value: 'Ganztags',    key: 'allDay',    emoji: '🗓️', defaultHour: '10:30' },
].map(x => ({ ...x, get name() { return t('values.time.' + x.key); } }));
const TIME = Object.fromEntries(TIMES.map(x => [x.value, x]));
const DURATIONS = ['ca. 1 Std.', '1–2 Std.', '2–3 Std.', 'Halber Tag', 'Ganzer Tag'];
const DURATION_KEYS = { 'ca. 1 Std.': 'h1', '1–2 Std.': 'h1to2', '2–3 Std.': 'h2to3', 'Halber Tag': 'halfDay', 'Ganzer Tag': 'fullDay' };
const GENDERS = [
  { value: 'frau',   emoji: '👩' },
  { value: 'mann',   emoji: '👨' },
  { value: 'divers', emoji: '🧑' },
].map(g => ({ ...g, get label() { return t('values.gender.' + g.value); }, get plural() { return t('values.genderPlural.' + g.value); } }));
const GENDER = Object.fromEntries(GENDERS.map(g => [g.value, g]));
const INTEREST_CHOICES = [
  { key: 'frau',  emoji: '👩', value: ['frau'] },
  { key: 'mann',  emoji: '👨', value: ['mann'] },
  { key: 'alle',  emoji: '🌈', value: ['frau', 'mann', 'divers'] },
].map(c => ({ ...c, get label() { return t('values.interestedIn.' + c.key); } }));
/** Anzeigenamen für gespeicherte Werte (unbekannte Werte werden unverändert angezeigt). */
const Label = {
  category: v => (CAT[v] ? CAT[v].name : v),
  time: v => (TIME[v] ? TIME[v].name : v),
  duration: v => (DURATION_KEYS[v] ? t('values.duration.' + DURATION_KEYS[v]) : v),
  gender: v => (GENDER[v] ? GENDER[v].label : v),
  interest: tag => tOr('values.interest.' + tag, tag),
};
function interestKey(arr) {
  const a = (arr || []).slice().sort().join(',');
  if (a === 'frau') return 'frau';
  if (a === 'mann') return 'mann';
  if (a) return 'alle';
  return null;
}
/** Grobe Koordinaten für die simulierte Entfernung (Raum Frankfurt). */
const PLACES = {
  'Frankfurt-Innenstadt': [50.1109, 8.6821], 'Frankfurt-Sachsenhausen': [50.1003, 8.6880],
  'Frankfurt-Nordend': [50.1250, 8.6900],    'Frankfurt-Bornheim': [50.1300, 8.7100],
  'Frankfurt-Bockenheim': [50.1220, 8.6450], 'Frankfurt-Westend': [50.1200, 8.6650],
  'Frankfurt-Ostend': [50.1130, 8.7150],     'Frankfurt-Gallus': [50.1030, 8.6350],
  'Frankfurt-Bahnhofsviertel': [50.1070, 8.6690], 'Frankfurt-Höchst': [50.1000, 8.5450],
  'Frankfurt-Rödelheim': [50.1250, 8.6050],  'Frankfurt-Niederrad': [50.0830, 8.6400],
  'Frankfurt-Fechenheim': [50.1230, 8.7600], 'Frankfurt-Riedberg': [50.1750, 8.6350],
  'Frankfurt am Main': [50.1109, 8.6821],    'Offenbach am Main': [50.0956, 8.7761],
  'Bad Homburg': [50.2268, 8.6182],          'Oberursel': [50.2010, 8.5770],
  'Eschborn': [50.1430, 8.5700],             'Neu-Isenburg': [50.0530, 8.6970],
  'Bad Vilbel': [50.1780, 8.7360],           'Hanau': [50.1264, 8.9283],
  'Darmstadt': [49.8728, 8.6512],            'Wiesbaden': [50.0782, 8.2398],
  'Mainz': [49.9929, 8.2473],
};
const CITY_NAMES = Object.keys(PLACES);
const INTEREST_TAGS = ['Kaffee', 'Brunch', 'Kochen', 'Streetfood', 'Wein', 'Craft Beer', 'Apfelwein', 'Backen',
  'Wandern', 'Radfahren', 'Laufen', 'Bouldern', 'Yoga', 'Fußball', 'Tennis', 'Tischtennis', 'Schwimmen', 'Tanzen',
  'Museen', 'Kino', 'Theater', 'Konzerte', 'Jazz', 'Techno', 'Lesen', 'Fotografie', 'Kunst', 'Design',
  'Reisen', 'Flohmärkte', 'Brettspiele', 'Gaming', 'Hunde', 'Katzen', 'Pflanzen', 'Podcasts', 'Comedy',
  'Karaoke', 'Nachhaltigkeit', 'Sprachen', 'Picknick', 'Camping', 'Sterne gucken', 'Festivals', 'Wellness', 'Vinyl'];
const IDEA_EMOJIS = ['🥐', '☕', '🍝', '🍜', '🍷', '🍺', '🍏', '🧀', '🌅', '🥾', '🚲', '🛶', '🏄', '🌳', '🌴', '🧺',
  '🎨', '🎭', '🎬', '🎷', '🎸', '📚', '📷', '🏙️', '🏓', '🧗', '⚽', '🏃', '💃', '🔐', '🎲', '🧖', '🌙', '🎡', '🐶', '✨'];
/** Foto-Platzhalter: Farbverlauf + Muster + Emoji (keine externen Bilder). */
const PHOTO_PRESETS = [
  { colors: ['#FF9A8B', '#FF5E7E'], emoji: '🌸', pattern: 1 }, { colors: ['#FAD961', '#F76B1C'], emoji: '☀️', pattern: 2 },
  { colors: ['#43E97B', '#1FA2A0'], emoji: '🌿', pattern: 3 }, { colors: ['#4FACFE', '#2563EB'], emoji: '🌊', pattern: 1 },
  { colors: ['#A18CD1', '#E58FD0'], emoji: '🔮', pattern: 2 }, { colors: ['#F6D365', '#FDA085'], emoji: '🍑', pattern: 3 },
  { colors: ['#5EE7DF', '#7F7FD5'], emoji: '🦋', pattern: 1 }, { colors: ['#C471F5', '#FA71CD'], emoji: '🎧', pattern: 2 },
  { colors: ['#FF758C', '#FF7EB3'], emoji: '🍓', pattern: 3 }, { colors: ['#38B2AC', '#84FAB0'], emoji: '🏔️', pattern: 1 },
  { colors: ['#8EC5FC', '#7B61FF'], emoji: '☁️', pattern: 2 }, { colors: ['#F093FB', '#F5576C'], emoji: '🔥', pattern: 3 },
  { colors: ['#FFB547', '#FF5A3C'], emoji: null, pattern: 1 },   { colors: ['#5B2A4E', '#C2577E'], emoji: null, pattern: 2 },
  { colors: ['#22A06B', '#B5E36B'], emoji: null, pattern: 3 },
];

/* =============================================================================
   2) STORAGE-ADAPTER
   ============================================================================= */

/**
 * Storage-Adapter mit In-Memory-Fallback (z. B. wenn localStorage in einer Sandbox
 * oder im privaten Modus blockiert ist). WIRD AUSSCHLIESSLICH VON DER DATENSCHICHT GENUTZT (Supabase-Sitzung, siehe supabase.js).
 */
const SafeStorage = (() => {
  function make(kind) {
    let ok = false;
    try {
      const s = window[kind];
      s.setItem('__asap_test__', '1');
      s.removeItem('__asap_test__');
      ok = true;
    } catch (e) { ok = false; }
    const mem = new Map();
    return {
      persistent: ok,
      get(key) {
        if (ok) { try { return window[kind].getItem(key); } catch (e) { /* weiter mit Memory */ } }
        return mem.has(key) ? mem.get(key) : null;
      },
      set(key, value) {
        if (ok) { try { window[kind].setItem(key, value); return; } catch (e) { /* weiter mit Memory */ } }
        mem.set(key, value);
      },
      remove(key) {
        if (ok) { try { window[kind].removeItem(key); } catch (e) { /* ignorieren */ } }
        mem.delete(key);
      },
    };
  }
  return { local: make('localStorage'), session: make('sessionStorage') };
})();

/** Fehlerklasse für „API“-Fehler – die UI zeigt message direkt an. */
class ApiError extends Error {
  constructor(message, code = 'ERROR', field = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.field = field;
  }
}

export { Util, SafeHtml, escapeHtml, raw, renderValue, html, Fmt, ICONS, icon, __logoSeq, logoMark, logo, CATEGORIES, CAT, BUDGETS, TIMES, TIME, DURATIONS, GENDERS, GENDER, INTEREST_CHOICES, Label, interestKey, PLACES, CITY_NAMES, INTEREST_TAGS, IDEA_EMOJIS, PHOTO_PRESETS, SafeStorage, ApiError };
