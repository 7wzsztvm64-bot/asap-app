/* Mehrsprachigkeit (Deutsch/Englisch).
   Regel: Neue oder geänderte Texte kommen in de.json UND en.json und werden über t('bereich.schluessel') genutzt.
   Bisher sind nur die Tab-Namen umgestellt; der Rest wird in Phase 1 schrittweise migriert. */
import de from './de.json';
import en from './en.json';

const DICTS = { de, en };
export const LANGS = Object.keys(DICTS);
// Bis alle Texte migriert sind, bleibt Deutsch Standard (sonst wäre die App gemischtsprachig).
let lang = 'de';

const lookup = (dict, key) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), dict);

export function getLang() { return lang; }
export function setLang(next) {
  if (!DICTS[next]) return;
  lang = next;
  document.documentElement.lang = next;
}
/** Übersetzt einen Schlüssel; {name}-Platzhalter werden aus vars gefüllt. Fällt auf Deutsch, dann auf den Schlüssel zurück. */
export function t(key, vars = {}) {
  const value = lookup(DICTS[lang], key) ?? lookup(DICTS.de, key) ?? key;
  return String(value).replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));
}
