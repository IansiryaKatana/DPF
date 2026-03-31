import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const { code } = await req.json().catch(() => ({ code: "" }));
    const normalizedCode = String(code || "").trim().toUpperCase();
    if (!normalizedCode) {
      return new Response(JSON.stringify({ valid: false, error: "Code is required." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const { data, error } = await supabase
      .from("client_access_codes")
      .select("id, code, plan, status, expires_at")
      .eq("code", normalizedCode)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return new Response(JSON.stringify({ valid: false, error: "Code not found." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }

    const isLifetime = data.plan === "enterprise";
    const expiresMs = new Date(data.expires_at).getTime();
    const isValid = data.status === "active" && (isLifetime || expiresMs > Date.now());

    return new Response(
      JSON.stringify({
        valid: isValid,
        lifetime: isLifetime,
        code: data.code,
        plan: data.plan,
        status: data.status,
        expires_at: data.expires_at,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ valid: false, error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
