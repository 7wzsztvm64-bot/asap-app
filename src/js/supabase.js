/* Supabase-Client – wird NUR von dataService.js importiert (Regel: Datenzugriff nur über DataService).
   URL und Key kommen aus der .env (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).
   Nur der öffentliche anon/publishable Key gehört hierher – niemals der service_role Key. */
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Platzhalter aus .env.example zählen nicht als eingerichtet
const isSupabaseConfigured = Boolean(url && anonKey && !url.includes('DEIN-PROJEKT'));

if (!isSupabaseConfigured && import.meta.env.DEV) {
  console.warn('[asap] Supabase ist nicht eingerichtet – .env aus .env.example anlegen und Werte eintragen.');
}

const supabase = isSupabaseConfigured ? createClient(url, anonKey) : null;

export { supabase, isSupabaseConfigured, url as supabaseUrl, anonKey as supabaseAnonKey };
