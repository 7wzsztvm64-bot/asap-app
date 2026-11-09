/* Supabase-Client – wird NUR von der Datenschicht importiert (dataService.js, supabaseBackend.js, mockBackend.js).
   URL und Key kommen aus der .env (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).
   Nur der öffentliche anon/publishable Key gehört hierher – niemals der service_role Key. */
import { createClient } from '@supabase/supabase-js';
import { SafeStorage } from './core.js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Platzhalter aus .env.example zählen nicht als eingerichtet
const isSupabaseConfigured = Boolean(url && anonKey && !url.includes('DEIN-PROJEKT'));

if (!isSupabaseConfigured && import.meta.env.DEV) {
  console.warn('[asap] Supabase ist nicht eingerichtet – .env aus .env.example anlegen und Werte eintragen.');
}

/* „Eingeloggt bleiben“: Mit Haken liegt die Sitzung in localStorage (bleibt nach dem Schließen),
   ohne Haken in sessionStorage (endet mit dem Tab). Die Wahl wird vor dem Login gesetzt. */
const REMEMBER_KEY = 'asap.remember';
const authStorage = {
  getItem: key => SafeStorage.session.get(key) ?? SafeStorage.local.get(key),
  setItem: (key, value) => {
    const remember = SafeStorage.local.get(REMEMBER_KEY) !== '0';
    (remember ? SafeStorage.local : SafeStorage.session).set(key, value);
    (remember ? SafeStorage.session : SafeStorage.local).remove(key);
  },
  removeItem: key => { SafeStorage.local.remove(key); SafeStorage.session.remove(key); },
};
function setRememberSession(remember) { SafeStorage.local.set(REMEMBER_KEY, remember ? '1' : '0'); }

const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, { auth: { storage: authStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

/** Prüft, ob Supabase mit URL und Key aus der .env erreichbar ist (Auth-Health-Endpunkt).
    Gibt { configured, ok, status, ms, version } zurück – wirft nicht. Für das Entwickler-Panel. */
async function checkSupabaseHealth() {
  if (!isSupabaseConfigured) return { configured: false, ok: false };
  const start = performance.now();
  try {
    const res = await fetch(`${url}/auth/v1/health`, { headers: { apikey: anonKey } });
    const body = await res.json().catch(() => ({}));
    return { configured: true, ok: res.ok, status: res.status, ms: Math.round(performance.now() - start), version: body.version || '' };
  } catch (e) {
    return { configured: true, ok: false, status: 0, ms: Math.round(performance.now() - start), error: e.message };
  }
}

export { supabase, isSupabaseConfigured, setRememberSession, checkSupabaseHealth };
