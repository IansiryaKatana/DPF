import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

/**
 * Read the persisted session from Supabase client storage. During cold loads or
 * Paystack return URLs, this can succeed before React auth context has caught up.
 */
export async function waitForSupabaseSession(options?: {
  attempts?: number;
  delayMs?: number;
}): Promise<Session | null> {
  const attempts = options?.attempts ?? 10;
  const delayMs = options?.delayMs ?? 200;
  for (let i = 0; i < attempts; i++) {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    if (data.session?.access_token) return data.session;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}
