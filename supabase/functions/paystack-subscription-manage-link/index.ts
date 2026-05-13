import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    if (!userData.user?.id) throw new Error("User not authenticated");

    const { productLine } = await req.json() as { productLine?: string };
    const line = String(productLine ?? "shopify").toLowerCase();
    if (line !== "shopify" && line !== "realestate") throw new Error("Invalid productLine");

    const table = line === "shopify" ? "subscriptions" : "realestate_subscriptions";
    const { data: row, error: rowError } = await supabase
      .from(table)
      .select("paystack_subscription_code")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (rowError) throw new Error(rowError.message);
    const subCode = String(row?.paystack_subscription_code ?? "").trim();
    if (!subCode) throw new Error("No active Paystack subscription on file");

    const { data: settings, error: settingsError } = await supabase
      .from("admin_settings")
      .select("setting_key, setting_value")
      .in("setting_key", ["paystack_secret_key"]);
    if (settingsError) throw new Error(`Failed to load Paystack settings: ${settingsError.message}`);
    const paystackSecret = String(
      settings?.find((s) => s.setting_key === "paystack_secret_key")?.setting_value ?? "",
    ).trim();
    if (!paystackSecret) throw new Error("Paystack secret key is missing in admin settings");

    const linkRes = await fetch(`https://api.paystack.co/subscription/${encodeURIComponent(subCode)}/manage/link`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${paystackSecret}`,
        "Content-Type": "application/json",
      },
    });
    const linkJson = await linkRes.json();
    if (!linkRes.ok || !linkJson?.status || !linkJson?.data?.link) {
      throw new Error(linkJson?.message || "Failed to generate Paystack subscription management link");
    }

    return new Response(
      JSON.stringify({ url: linkJson.data.link as string }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
