/* Mehrsprachigkeit (Deutsch/Englisch).
   Regel: Neue oder geänderte Texte kommen in de.json UND en.json und werden über t('bereich.schluessel') genutzt.
   Die Sprachwahl ist eine reine Geräte-Einstellung (keine Nutzerdaten) und wird deshalb hier
   selbst in localStorage gemerkt. Ohne gespeicherte Wahl gilt die Browsersprache, sonst Deutsch. */
import de from './de.json' with { type: 'json' };
import en from './en.json' with { type: 'json' };

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
