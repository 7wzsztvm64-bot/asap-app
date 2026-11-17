/* Mehrsprachigkeit (Deutsch/Englisch).
   Regel: Neue oder geänderte Texte kommen in de.json UND en.json und werden über t('bereich.schluessel') genutzt.
   Die Sprachwahl ist eine reine Geräte-Einstellung (keine Nutzerdaten) und wird deshalb hier
   selbst in localStorage gemerkt. Ohne gespeicherte Wahl gilt die Browsersprache, sonst Deutsch. */
import de from './de.json' with { type: 'json' };
import en from './en.json' with { type: 'json' };
import legalDe from './legal.de.json' with { type: 'json' };
import legalEn from './legal.en.json' with { type: 'json' };

const DICTS = { de, en };
const STORE_KEY = 'asap.lang';
export const LANGS = Object.keys(DICTS);

function initialLang() {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (DICTS[saved]) return saved;
  } catch (e) { /* z. B. privater Modus – dann Browsersprache */ }
  const browser = (typeof navigator !== 'undefined' && navigator.language || 'de').slice(0, 2).toLowerCase();
  return DICTS[browser] ? browser : 'de';
}

let lang = initialLang();
const listeners = new Set();
if (typeof document !== 'undefined') document.documentElement.lang = lang;

const lookup = (dict, key) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), dict);

export function getLang() { return lang; }
/** Sprache wechseln, merken und alle Listener (z. B. die App zum Neuzeichnen) informieren. */
export function setLang(next) {
  if (!DICTS[next] || next === lang) return;
  lang = next;
  document.documentElement.lang = next;
  try { localStorage.setItem(STORE_KEY, next); } catch (e) { /* nicht speicherbar – gilt nur bis zum Neuladen */ }
  listeners.forEach(fn => fn(next));
}
export function onLangChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** Übersetzt einen Schlüssel; {name}-Platzhalter werden aus vars gefüllt. Fällt auf Deutsch, dann auf den Schlüssel zurück. */
export function t(key, vars = {}) {
  const value = lookup(DICTS[lang], key) ?? lookup(DICTS.de, key) ?? key;
  return String(value).replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));
}
/** Wie t(), aber mit eigenem Rückfallwert, falls es den Schlüssel nicht gibt (z. B. freie Werte aus der Datenbank). */
export function tOr(key, fallback, vars = {}) {
  return lookup(DICTS[lang], key) != null || lookup(DICTS.de, key) != null ? t(key, vars) : fallback;
}

/* Rechtstexte (Datenschutz, Nutzungsregeln, Impressum) stehen wegen ihrer Länge in legal.de.json/legal.en.json.
   Version der Texte: bei wesentlichen Änderungen erhöhen – wird bei der Registrierung gespeichert. */
export const LEGAL_VERSION = '2026-11-beta';
export const LEGAL_DOCS = ['privacy', 'terms', 'imprint'];
const LEGAL = { de: legalDe, en: legalEn };
/** Kontaktdaten des Verantwortlichen aus .env bzw. Netlify (VITE_CONTACT_*), damit die Adresse nicht im Repo steht. */
function contact() {
  const env = import.meta.env || {};
  const missing = lang === 'en' ? '[to be added]' : '[wird ergänzt]';
  return { name: env.VITE_CONTACT_NAME || missing, address: env.VITE_CONTACT_ADDRESS || missing, email: env.VITE_CONTACT_EMAIL || missing };
}
/** Ein Rechtstext in der aktuellen Sprache, Platzhalter ({name}, {address}, {email}) gefüllt. */
export function legalDoc(doc) {
  const src = (LEGAL[lang] || LEGAL.de)[doc];
  if (!src) return null;
  const vars = contact();
  const fill = s => String(s).replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));
  return { title: src.title, intro: fill(src.intro),
    sections: src.sections.map(x => ({ h: fill(x.h), p: (x.p || []).map(fill), li: (x.li || []).map(fill) })) };
}
