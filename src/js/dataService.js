import { MockBackend } from './mockBackend.js';
import { SupabaseBackend } from './supabaseBackend.js';

/* =============================================================================
   DATASERVICE – die EINZIGE Schicht mit Datenzugriff
   -----------------------------------------------------------------------------
   Die UI importiert nur diese Datei und ruft ausschließlich DataService-Methoden auf.
   Dahinter steckt eines von zwei Backends mit identischen Methoden und Rückgabeformen:
     • mockBackend.js     – localStorage + simulierte Testpersonen (Standard)
     • supabaseBackend.js – echtes Backend (Supabase), aktiv mit VITE_BACKEND=supabase in .env
   Das Mock-Backend entfällt mit Issue #10 („Simulation entfernen“).
   ============================================================================= */
const DataService = import.meta.env.VITE_BACKEND === 'supabase' ? SupabaseBackend : MockBackend;

export { DataService };
