/* =============================================================================
   asap – Dating-App, in der man Date-Ideen statt Profile likt.
   Aufbau des Codes (Module in src/js/, früher eine Datei):
     1) Hilfsfunktionen, HTML-Templating, Formatierung, Icons, Konstanten
     2) Krypto (SHA-256) & Storage-Adapter (nur vom DataService genutzt)
     3) Testdaten (Seed)
     4) DataService – die EINZIGE Schicht mit Datenzugriff (Mock-Backend)
     5) UI: Komponenten, Router, Ansichten, Overlays, Entwickler-Panel
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

/* ---------- Formatierung (deutsch) ---------- */
const Fmt = (() => {
  const timeF = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
  const wdShort = new Intl.DateTimeFormat('de-DE', { weekday: 'short' });
  const wdLong = new Intl.DateTimeFormat('de-DE', { weekday: 'long' });
  const dayMonthLong = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long' });
  const dayMonthNum = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' });
  const monthShort = new Intl.DateTimeFormat('de-DE', { month: 'short' });
  const num1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 0 });
  const DAY = 86400000;
  const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
  const dayDiff = ts => Math.round((startOfDay(Date.now()) - startOfDay(ts)) / DAY);
  const stripDot = s => s.replace(/\.$/, '');
  const dm = d => dayMonthNum.format(d).replace(/\.?$/, '.'); // „10.10.“ (genau ein Punkt)
  return {
    time: ts => timeF.format(new Date(ts)),
    chatListTime(ts) {
      const diff = dayDiff(ts);
      if (diff <= 0) return timeF.format(new Date(ts));
      if (diff === 1) return 'Gestern';
      if (diff < 7) return stripDot(wdShort.format(new Date(ts))) + '.';
      return dm(new Date(ts));
    },
    dayLabel(ts) {
      const diff = dayDiff(ts);
      if (diff === 0) return 'Heute';
      if (diff === 1) return 'Gestern';
      return wdLong.format(new Date(ts)) + ', ' + dayMonthLong.format(new Date(ts));
    },
    relative(ts) {
      const s = Math.round((Date.now() - ts) / 1000);
      if (s < 60) return 'gerade eben';
      const m = Math.round(s / 60);
      if (m < 60) return `vor ${m} Min.`;
      const h = Math.round(m / 60);
      if (h < 24) return `vor ${h} Std.`;
      const d = dayDiff(ts);
      if (d === 1) return 'gestern';
      if (d < 7) return `vor ${d} Tagen`;
      return dm(new Date(ts));
    },
    dateTimeLong(iso) {
      const d = new Date(iso);
      return `${wdLong.format(d)}, ${dayMonthLong.format(d)} · ${timeF.format(d)} Uhr`;
    },
    dateShort(iso) {
      const d = new Date(iso);
      return `${stripDot(wdShort.format(d))}, ${dm(d)} · ${timeF.format(d)}`;
    },
    whenSpoken(iso) {
      const d = new Date(iso);
      const diff = -dayDiff(d.getTime());
      const day = diff === 0 ? 'heute' : diff === 1 ? 'morgen' : wdLong.format(d);
      return `${day} um ${timeF.format(d)}`;
    },
    weekdayShort: iso => stripDot(wdShort.format(new Date(iso))),
    weekdayLong: iso => wdLong.format(new Date(iso)),
    monthShort: iso => stripDot(monthShort.format(new Date(iso))),
    dayNum: iso => new Date(iso).getDate(),
    km: n => num1.format(n) + ' km',
    countdown(iso) {
      const ms = new Date(iso).getTime() - Date.now();
      if (ms < 0) return 'vorbei';
      const days = -dayDiff(new Date(iso).getTime());
      if (days === 0) { const h = Math.max(1, Math.round(ms / 3600000)); return `in ${h} Std.`; }
      if (days === 1) return 'morgen';
      return `in ${days} Tagen`;
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

/* ---------- Fachliche Konstanten ---------- */
const CATEGORIES = [
  { label: 'Essen & Trinken', emoji: '🍽️', from: '#FF6B4A', to: '#FFB25B' },
  { label: 'Outdoor',         emoji: '🌿', from: '#2E9E6B', to: '#9BD770' },
  { label: 'Kultur',          emoji: '🎭', from: '#6A4BD8', to: '#C77DDE' },
  { label: 'Sport',           emoji: '🏸', from: '#1F7AE0', to: '#5CC8F0' },
  { label: 'Abenteuer',       emoji: '🧗', from: '#E2335B', to: '#FF8A5B' },
  { label: 'Entspannt',       emoji: '🧺', from: '#14A3A3', to: '#8EDDC9' },
];
const CAT = Object.fromEntries(CATEGORIES.map(c => [c.label, c]));
const BUDGETS = [
  { value: '€',   label: 'günstig',  hint: 'bis ca. 15 € p. P.' },
  { value: '€€',  label: 'mittel',   hint: 'ca. 15–40 € p. P.' },
  { value: '€€€', label: 'gehoben',  hint: 'ab ca. 40 € p. P.' },
];
const TIMES = [
  { value: 'Morgens',     emoji: '🌅', defaultHour: '10:00' },
  { value: 'Mittags',     emoji: '☀️', defaultHour: '12:30' },
  { value: 'Nachmittags', emoji: '🌤️', defaultHour: '15:00' },
  { value: 'Abends',      emoji: '🌙', defaultHour: '19:00' },
  { value: 'Ganztags',    emoji: '🗓️', defaultHour: '10:30' },
];
const TIME = Object.fromEntries(TIMES.map(t => [t.value, t]));
const DURATIONS = ['ca. 1 Std.', '1–2 Std.', '2–3 Std.', 'Halber Tag', 'Ganzer Tag'];
const GENDERS = [
  { value: 'frau',   label: 'Frau',   plural: 'Frauen', emoji: '👩' },
  { value: 'mann',   label: 'Mann',   plural: 'Männer', emoji: '👨' },
  { value: 'divers', label: 'Divers', plural: 'Diverse', emoji: '🧑' },
];
const GENDER = Object.fromEntries(GENDERS.map(g => [g.value, g]));
const INTEREST_CHOICES = [
  { key: 'frau',  label: 'Frauen', emoji: '👩', value: ['frau'] },
  { key: 'mann',  label: 'Männer', emoji: '👨', value: ['mann'] },
  { key: 'alle',  label: 'Alle',   emoji: '🌈', value: ['frau', 'mann', 'divers'] },
];
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
   2) KRYPTO & STORAGE-ADAPTER
   ============================================================================= */

/**
 * SHA-256 als Hex-String.
 * ACHTUNG – NUR ZUR SIMULATION: Ein clientseitiger, ungesalzener bzw. nur mit der
 * E-Mail „gepfefferter" SHA-256-Hash ist KEIN produktionsreifes Passwortverfahren.
 * In Produktion: Passwort per HTTPS an das Backend senden und dort mit Argon2id,
 * scrypt oder bcrypt (individueller Salt, hoher Kostenfaktor) hashen.
 */
async function sha256Hex(text) {
  try {
    if (window.crypto && window.crypto.subtle) {
      const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) { /* z. B. unsicherer Kontext – Fallback unten */ }
  return sha256Fallback(text);
}
/** Reine JS-Implementierung als Fallback, falls die Web Crypto API nicht verfügbar ist (z. B. http://). */
function sha256Fallback(text) {
  const bytes = new TextEncoder().encode(text);
  const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  let H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const len = bytes.length;
  const total = ((len + 9 + 63) >> 6) << 6;
  const buf = new Uint8Array(total);
  buf.set(bytes); buf[len] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, Math.floor(len / 0x20000000));
  dv.setUint32(total - 4, (len << 3) >>> 0);
  const W = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H = [H[0] + a, H[1] + b, H[2] + c, H[3] + d, H[4] + e, H[5] + f, H[6] + g, H[7] + h].map(x => x >>> 0);
  }
  return H.map(x => x.toString(16).padStart(8, '0')).join('');
}
function hashPassword(email, password) {
  // Simulation: E-Mail als „Salt“. Siehe Hinweis bei sha256Hex – nicht produktionsreif!
  return sha256Hex(String(email).trim().toLowerCase() + '::' + password);
}

/**
 * Storage-Adapter mit In-Memory-Fallback (z. B. wenn localStorage in einer Sandbox
 * oder im privaten Modus blockiert ist). WIRD AUSSCHLIESSLICH VOM DataService GENUTZT.
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

export { Util, SafeHtml, escapeHtml, raw, renderValue, html, Fmt, ICONS, icon, __logoSeq, logoMark, logo, CATEGORIES, CAT, BUDGETS, TIMES, TIME, DURATIONS, GENDERS, GENDER, INTEREST_CHOICES, interestKey, PLACES, CITY_NAMES, INTEREST_TAGS, IDEA_EMOJIS, PHOTO_PRESETS, sha256Hex, sha256Fallback, hashPassword, SafeStorage, ApiError };
