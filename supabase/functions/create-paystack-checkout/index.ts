import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PLAN_PRICES_USD: Record<string, number> = {
  growth: 500,
  pro: 700,
  enterprise: 12000,
};

const getUsdToKesRate = async (): Promise<number> => {
  const response = await fetch("https://open.er-api.com/v6/latest/USD", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch FX rate (HTTP ${response.status})`);
  }

  const json = await response.json();
  const rate = Number(json?.rates?.KES);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("Invalid USD/KES FX rate response");
  }

  return rate;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    if (!userData.user?.email) throw new Error("User not authenticated");

    const { planKey } = await req.json();
    if (!planKey || !PLAN_PRICES_USD[planKey]) throw new Error("Invalid plan");

    const { data: settings, error: settingsError } = await supabase
      .from("admin_settings")
      .select("setting_key, setting_value")
      .in("setting_key", [
        "paystack_secret_key",
        "plan_price_growth",
        "plan_price_pro",
        "plan_price_enterprise",
      ]);

    if (settingsError) throw new Error(`Failed to load Paystack settings: ${settingsError.message}`);
    const paystackSecret = settings?.find((s) => s.setting_key === "paystack_secret_key")?.setting_value ?? "";
    if (!paystackSecret) throw new Error("Paystack secret key is missing in admin settings");

    const parsePlanPrice = (value: string | null | undefined, fallback: number) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    };
    const resolvedPlanPrices: Record<string, number> = {
      growth: parsePlanPrice(settings?.find((s) => s.setting_key === "plan_price_growth")?.setting_value, PLAN_PRICES_USD.growth),
      pro: parsePlanPrice(settings?.find((s) => s.setting_key === "plan_price_pro")?.setting_value, PLAN_PRICES_USD.pro),
      enterprise: parsePlanPrice(settings?.find((s) => s.setting_key === "plan_price_enterprise")?.setting_value, PLAN_PRICES_USD.enterprise),
    };
    const planAmountUsd = resolvedPlanPrices[planKey];
    const usdToKesRate = await getUsdToKesRate();
    const planAmountKes = Number((planAmountUsd * usdToKesRate).toFixed(2));
    const amountInMinorUnits = Math.round(planAmountKes * 100);
    const origin = req.headers.get("origin") || "http://localhost:8081";
    const reference = `DPF_${userData.user.id}_${planKey}_${Date.now()}`;

    const initRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: userData.user.email,
        amount: amountInMinorUnits,
        currency: "KES",
        reference,
        callback_url: `${origin}/dashboard?checkout=paystack-success`,
        metadata: {
          userId: userData.user.id,
          planKey,
          platform: "DataPulseFlow",
          requested_currency: "USD",
          requested_amount_usd: planAmountUsd,
          charged_currency: "KES",
          charged_amount_kes: planAmountKes,
          usd_to_kes_rate: usdToKesRate,
        },
      }),
    });

    const initJson = await initRes.json();
    if (!initRes.ok || !initJson?.status || !initJson?.data?.authorization_url) {
      throw new Error(initJson?.message || "Failed to initialize Paystack checkout");
    }

    return new Response(
      JSON.stringify({
        authorization_url: initJson.data.authorization_url,
        access_code: initJson.data.access_code,
        reference: initJson.data.reference,
        amount_minor_units: amountInMinorUnits,
        charge_currency: "KES",
        display_currency: "USD",
        display_amount: planAmountUsd,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
