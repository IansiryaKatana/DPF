import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import {
  fetchVerifiedPaystackTransaction,
  processPaystackSubscriptionCharge,
} from "../_shared/paystack-subscription-fulfillment.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const assertAdmin = async (supabase: ReturnType<typeof createClient>, userId: string) => {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(`Admin check failed: ${error.message}`);
  if (!data) throw new Error("Admin access required");
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
    await assertAdmin(supabase, userData.user.id);

    const body = await req.json() as {
      reference?: string;
      userId?: string;
      productLine?: string;
      subscriptionCode?: string;
    };
    const reference = String(body?.reference ?? "").trim();
    if (!reference) throw new Error("Paystack transaction reference is required");
    const overrideUserId = String(body?.userId ?? "").trim() || undefined;
    const overrideProductLineRaw = String(body?.productLine ?? "").trim().toLowerCase();
    const overrideProductLine = overrideProductLineRaw === "realestate"
      ? "realestate" as const
      : overrideProductLineRaw === "shopify"
      ? "shopify" as const
      : undefined;
    const overrideSubscriptionCode = String(body?.subscriptionCode ?? "").trim() || undefined;

    const { data: settings, error: settingsError } = await supabase
      .from("admin_settings")
      .select("setting_key, setting_value")
      .in("setting_key", ["paystack_secret_key"]);
    if (settingsError) throw new Error(`Failed to load Paystack settings: ${settingsError.message}`);
    const paystackSecret = String(
      settings?.find((s) => s.setting_key === "paystack_secret_key")?.setting_value ?? "",
    ).trim();
    if (!paystackSecret) throw new Error("Paystack secret key is missing in admin settings");

    const payment = await fetchVerifiedPaystackTransaction(reference, paystackSecret);
    const result = await processPaystackSubscriptionCharge({
      supabase,
      payment,
      paystackSecret,
      overrideUserId,
      overrideProductLine,
      overrideSubscriptionCode,
    });

    if (result.status === "ignored") {
      return new Response(
        JSON.stringify({ status: "IGNORED", reason: result.reason, reference }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 422 },
      );
    }
    if (result.status === "error") {
      return new Response(
        JSON.stringify({ status: "ERROR", error: result.message, reference }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 422 },
      );
    }

    return new Response(
      JSON.stringify({
        status: result.alreadyProcessed ? "ALREADY_PROCESSED" : "COMPLETED",
        reference: result.reference,
        userId: result.userId,
        plan: result.plan,
        accessCode: result.accessCode,
        accessCodeExpiresAt: result.accessCodeExpiresAt,
      }),
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
