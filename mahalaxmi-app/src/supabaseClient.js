import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.error(
    "Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // sessionStorage instead of the default localStorage: survives a page
    // refresh within the same tab, but the browser clears it the moment the
    // tab or window actually closes — so closing out always means signing
    // in again next time.
    storage: window.sessionStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
