import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let browserClient: SupabaseClient | null | undefined;

export function createSupabaseBrowserClient() {
  if (browserClient !== undefined) {
    return browserClient;
  }

  if (!url || !anonKey) {
    browserClient = null;
    return browserClient;
  }

  browserClient = createBrowserClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false
    }
  });

  return browserClient;
}
